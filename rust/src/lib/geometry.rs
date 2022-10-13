
// Warum auch immer Rust die Warnung zeigt, hiermit sind sie weg:
#[allow(dead_code)]

pub mod geometry {

	use json;
	use json::JsonValue;
	use std::cmp::Ordering;
	use std::collections::BinaryHeap;
	use std::f32::consts::PI;
	use std::fmt;
	use std::fs;
	use std::path::Path;
	use std::rc::Rc;



	const DEG2RAD: f32 = PI / 180.0;
	const DEG2METERS: f32 = 6378137.0 * DEG2RAD;



	#[derive(Debug)]
	pub struct Bbox {
		x_min: f32,
		y_min: f32,
		x_max: f32,
		y_max: f32,
	}

	impl Bbox {
		fn new() -> Bbox {
			Bbox {
				x_min: 180.0,
				y_min:  90.0,
				x_max:-180.0,
				y_max: -90.0,
			}
		}
		pub fn from_coordinates(x_min:f32, y_min:f32, x_max:f32, y_max:f32) -> Bbox {
			return Bbox {x_min, y_min, x_max, y_max}
		}
		fn from_segments(segments: &Vec<Rc<Segment>>) -> Bbox {
			let mut bbox = Bbox::new();
			for segment in segments {
				bbox.add_point(&segment.p0);
				bbox.add_point(&segment.p1);
			}
			return bbox;
		}
		fn add_point(&mut self, point: &Point) {
			if self.x_min > point.x {
				self.x_min = point.x
			};
			if self.y_min > point.y {
				self.y_min = point.y
			};
			if self.x_max < point.x {
				self.x_max = point.x
			};
			if self.y_max < point.y {
				self.y_max = point.y
			};
		}
		fn add_bbox(&mut self, bbox: &Bbox) {
			if self.x_min > bbox.x_min {
				self.x_min = bbox.x_min
			};
			if self.y_min > bbox.y_min {
				self.y_min = bbox.y_min
			};
			if self.x_max < bbox.x_max {
				self.x_max = bbox.x_max
			};
			if self.y_max < bbox.y_max {
				self.y_max = bbox.y_max
			};
		}
		pub fn center(&self) -> Point {
			return Point::new(
				(self.x_min + self.x_max) / 2.0,
				(self.y_min + self.y_max) / 2.0,
			);
		}
		fn top_left(&self) -> Point {
			return Point::new(
				self.x_min,
				self.y_max,
			);
		}
		fn width(&self) -> f32 {
			return self.x_max - self.x_min;
		}
		fn height(&self) -> f32 {
			return self.y_max - self.y_min;
		}
		fn distance_to(&self, point: &Point) -> f32 {
			let dx = (self.x_min - point.x).max(point.x - self.x_max).max(0.0);
			let dy = (self.y_min - point.y).max(point.y - self.y_max).max(0.0);

			return (dx * dx * point.scale_x2 + dy * dy).sqrt() * DEG2METERS;
		}
		fn contains_point(&self, point: &Point) -> bool {
			if (point.x < self.x_min) || (point.y < self.y_min) {
				return false;
			}
			if (point.x > self.x_max) || (point.y > self.y_max) {
				return false;
			}
			return true;
		}
		fn overlaps_bbox(&self, bbox: &Bbox) -> bool {
			if (bbox.x_min > self.x_max) || (bbox.x_max < self.x_min) {
				return false;
			}
			if (bbox.y_min > self.y_max) || (bbox.y_max < self.y_min) {
				return false;
			}
			return true;
		}
		fn covers_bbox(&self, bbox: &Bbox) -> bool {
			if (bbox.x_min < self.x_min) || (bbox.x_max > self.x_max) {
				return false;
			}
			if (bbox.y_min < self.y_min) || (bbox.y_max > self.y_max) {
				return false;
			}
			return true;
		}
	}
	impl fmt::Display for Bbox {
		fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
			write!(
				f,
				"{{\"type\":\"Feature\",\"geometry\":{{\"type\":\"Polygon\",\"coordinates\":[[[{},{}],[{},{}],[{},{}],[{},{}],[{},{}]]]}}}}",
				self.x_min, self.y_min,
				self.x_min, self.y_max,
				self.x_max, self.y_max,
				self.x_max, self.y_min,
				self.x_min, self.y_min,
			)
		}
	}



	#[derive(Copy, Clone, Debug)]
	pub struct Point {
		x: f32,
		y: f32,
		scale_x2: f32,
	}

	impl Point {
		pub fn new(x: f32, y: f32) -> Point {
			return Point {
				x,
				y,
				scale_x2: (y * DEG2RAD).cos().powi(2),
			};
		}
		pub fn clone(&self) -> Point {
			return Point {
				x: self.x,
				y: self.y,
				scale_x2: self.scale_x2,
			};
		}
		fn import_from_json(coordinates_point: &JsonValue) -> Point {
			return Point::new(
				coordinates_point[0].as_f32().unwrap(),
				coordinates_point[1].as_f32().unwrap(),
			);
		}
	}


	#[derive(Debug)]
	struct Polyline {
		points: Vec<Point>,
		bbox: Bbox,
	}

	impl Polyline {
		fn new() -> Polyline {
			return Polyline {
				points: Vec::new(),
				bbox: Bbox::new(),
			};
		}
		fn from_points(points: Vec<Point>) -> Polyline {
			let mut polyline = Polyline {
				points,
				bbox: Bbox::new(),
			};
			polyline.update_bbox();
			return polyline;
		}
		fn import_from_json(coordinates_line: &JsonValue) -> Polyline {
			let mut polyline = Polyline::new();
			for coordinates_point in coordinates_line.members() {
				polyline
					.points
					.push(Point::import_from_json(coordinates_point))
			}
			polyline.update_bbox();
			return polyline;
		}
		fn clone_cut<F>(&self, filter:F) -> Polyline where F: Fn(Point) -> bool {
			let mut outside:Vec<bool> = Vec::new();
			for i in 0..self.points.len()-1 {
				outside.insert(i, filter(self.points[i]));
			}

			let n = outside.len();
			let mut points:Vec<Point> = Vec::new();
			for i in 0..n {
				let drop:bool = outside[i] && outside[(i+1) % n] && outside[(i+n-1) % n];
				if !drop {
					points.push(self.points[i].clone());
				}
			}

			if points.len() > 0 {
				points.push(points[0]);
			}

			return Polyline::from_points(points);
		}
		fn update_bbox(&mut self) {
			let bbox = &mut self.bbox;
			for point in &self.points {
				bbox.add_point(&point);
			}
		}
		fn extract_segments_to(&self, segments: &mut Segments) {
			for i in 0..(self.points.len() - 2) {
				let p0 = self.points[i];
				let p1 = self.points[i + 1];
				segments.add(p0, p1);
			}
		}
		fn contains_point(&self, point:&Point) -> bool {
			if !self.bbox.contains_point(point) {
				return false;
			}

			// A point is in a polygon if a line from the point to infinity crosses the polygon an odd number of times
			let mut odd:bool = false;
			
			//For each edge (In this case for each point of the polygon and the previous one)
			for i in 0..self.points.len()-1 {
				//If a line from the point into infinity crosses this edge
				let p0 = self.points[i  ];
				let p1 = self.points[i+1];

				// One point needs to be above, one below our y coordinate
				if (p1.y > point.y) != (p0.y > point.y) {
					// ...and the edge doesn't cross our Y corrdinate before our x coordinate (but between our x coordinate and infinity)
					if point.x < (p0.x - p1.x) * (point.y - p1.y) / (p0.y - p1.y) + p1.x {
						odd = !odd; // negate odd
					}
				}
			}
			
			//If the number of crossings was odd, the point is in the polygon
			return odd;
		}
		pub fn point_count(&self) -> u32 {
			return self.points.len() as u32;
		}
	}


	#[derive(Debug)]
	struct Polygon {
		rings: Vec<Polyline>,
		bbox: Bbox,
	}

	impl Polygon {
		fn new() -> Polygon {
			return Polygon {
				rings: Vec::new(),
				bbox: Bbox::new(),
			};
		}
		fn from_rings(rings: Vec<Polyline>) -> Polygon {
			let mut polygon = Polygon {
				rings,
				bbox: Bbox::new(),
			};
			polygon.update_bbox();
			return polygon;
		}
		fn import_from_json(coordinates_polygon: &JsonValue) -> Polygon {
			let mut polygon = Polygon::new();
			for coordinates_ring in coordinates_polygon.members() {
				polygon
					.rings
					.push(Polyline::import_from_json(coordinates_ring))
			}
			polygon.update_bbox();
			return polygon;
		}
		fn clone_cut<F>(&self, filter:&F) -> Polygon where F: Fn(Point) -> bool {
			let mut rings:Vec<Polyline> = Vec::new();
			for ring in &self.rings {
				let ring_clone = ring.clone_cut(filter);
				if ring_clone.points.len() > 0 {
					rings.push(ring_clone);
				}
			}
			return Polygon::from_rings(rings);
		}
		fn update_bbox(&mut self) {
			let bbox = &mut self.bbox;
			for ring in &self.rings {
				bbox.add_bbox(&ring.bbox);
			}
		}
		fn extract_segments_to(&self, segments: &mut Segments) {
			for ring in &self.rings {
				ring.extract_segments_to(segments);
			}
		}
		fn contains_point(&self, point:&Point) -> bool {
			if !self.bbox.contains_point(point) {
				return false;
			}

			if !self.rings[0].contains_point(point) {
				return false;
			}

			for i in 1..self.rings.len() {
				let ring = &self.rings[i];
				if ring.contains_point(point) {
					return false;
				}
			}

			return true;
		}
		pub fn point_count(&self) -> u32 {
			let mut sum:u32 = 0;
			for ring in &self.rings {
				sum += ring.point_count();
			}
			return sum;
		}
	}

	pub struct Geometry {
		polygons: Vec<Polygon>,
	}
	impl Geometry {
		pub fn new() -> Geometry {
			return Geometry {
				polygons: Vec::new()
			};
		}
		pub fn fill_from_json(&mut self, filename: &Path) {
			let contents: &str = &fs::read_to_string(filename).unwrap();
			let data = json::parse(contents).unwrap();
			let features = &data["features"];
			for feature in features.members() {
				self.add_json_geometry(&feature["geometry"]);
			}
		}
		fn add_json_geometry(&mut self, geometry:&JsonValue) {
			if !geometry["type"].is_string() {
				println!("{}", geometry);
			}

			let geometry_type = geometry["type"].as_str().unwrap();

			match geometry_type {
				"Polygon" => {
					self.polygons.push(
						Polygon::import_from_json(&geometry["coordinates"])
					)
				},
				"MultiPolygon" => {
					for polygon in geometry["coordinates"].members() {
						self.polygons.push(
							Polygon::import_from_json(polygon)
						)
					}
				},
				"GeometryCollection" => {
					for sub_geometry in geometry["geometries"].members() {
						self.add_json_geometry(sub_geometry);
					}
				},
				"LineString" => { return },
				_ => {
					println!("{}", geometry);
					panic!("unknown geometry_type: '{}'", geometry_type)
				}
			}
		}
		pub fn clone_cut<F>(&self, filter:&F) -> Geometry where F: Fn(Point) -> bool {
			let mut polygons:Vec<Polygon> = Vec::new();
			for polygon in &self.polygons {
				let clone = polygon.clone_cut(filter);
				if clone.rings.len() > 0 {
					polygons.push(clone);
				}
			}
			return Geometry { polygons }
		}
		pub fn clone_cut_top(&self, y:f32) -> Geometry {
			return self.clone_cut(&|p:Point| -> bool { p.y > y });
		}
		pub fn clone_cut_bot(&self, y:f32) -> Geometry {
			return self.clone_cut(&|p:Point| -> bool { p.y < y });
		}
		pub fn clone_cut_lef(&self, x:f32) -> Geometry {
			return self.clone_cut(&|p:Point| -> bool { p.x < x });
		}
		pub fn clone_cut_rig(&self, x:f32) -> Geometry {
			return self.clone_cut(&|p:Point| -> bool { p.x > x });
		}
		pub fn contains_point(&self, point: &Point) -> bool {
			return self.polygons.iter().any(|polygon| polygon.contains_point(point));
		}
		pub fn point_count(&self) -> u32 {
			let mut sum:u32 = 0;
			for polygon in &self.polygons {
				sum += polygon.point_count();
			}
			return sum;
		}
	}

	pub struct Collection {
		pub geometry: Geometry,
		segments: Segments
	}

	impl Collection {
		pub fn new() -> Collection {
			return Collection {
				geometry: Geometry::new(),
				segments: Segments::new(),
			};
		}
		pub fn fill_from_json(&mut self, filename: &Path) {
			self.geometry.fill_from_json(filename);
			for polygon in &self.geometry.polygons {
				polygon.extract_segments_to(&mut self.segments);
			}
			self.segments.init_tree();
		}
		pub fn get_min_distance(&self, point: &Point, max_distance:f32) -> f32 {
			return self.segments.get_min_distance(point, max_distance);
		}
	}



	struct Segment {
		p0: Point,
		p1: Point,
		center: Point,
	}

	impl Segment {
		fn new(p0: Point, p1: Point) -> Segment {
			return Segment {
				p0,
				p1,
				center: Point::new((p0.x + p1.x) / 2.0, (p0.y + p1.y) / 2.0),
			};
		}
	}



	struct Segments {
		segments: Vec<Rc<Segment>>,
		root: Option<Rc<SegmentTreeNode>>,
	}

	impl Segments {
		fn add(&mut self, p0: Point, p1: Point) {
			self.segments.push(Rc::new(Segment::new(p0, p1)));
		}
		pub fn new() -> Segments {
			return Segments {
				segments: Vec::new(),
				root: None,
			};
		}
		fn init_tree(&mut self) {
			let node = self.create_node(&self.segments);
			self.root = Some(Rc::new(node));
		}
		fn create_node(&self, segments: &Vec<Rc<Segment>>) -> SegmentTreeNode {
			let bbox = Bbox::from_segments(segments);
			let center = bbox.center();

			let mut segments1: Vec<Rc<Segment>> = Vec::new();
			let mut segments2: Vec<Rc<Segment>> = Vec::new();

			if bbox.width() > bbox.height() {
				for segment in segments.iter() {
					if segment.center.x < center.x {
						segments1.push(segment.clone());
					} else {
						segments2.push(segment.clone());
					}
				}
			} else {
				for segment in segments.iter() {
					if segment.center.y < center.y {
						segments1.push(segment.clone());
					} else {
						segments2.push(segment.clone());
					}
				}
			}

			if segments1.len() == 0 {
				return SegmentTreeNode {
					bbox,
					is_leaf: true,
					left: None,
					right: None,
					segments: Some(segments2),
				};
			}

			if segments2.len() == 0 {
				return SegmentTreeNode {
					bbox,
					is_leaf: true,
					left: None,
					right: None,
					segments: Some(segments1),
				};
			}

			return SegmentTreeNode {
				bbox,
				is_leaf: false,
				left: Some(Rc::new(self.create_node(&segments1))),
				right: Some(Rc::new(self.create_node(&segments2))),
				segments: None,
			};
		}
		pub fn get_min_distance(&self, point: &Point, max_distance:f32) -> f32 {
			let mut heap = BinaryHeap::new();
			let root = (self.root).as_ref().unwrap().clone();
			heap.push(HeapNode::new(&root, point));

			let mut min_distance: f32 = max_distance;

			while !heap.is_empty() {
				let heap_node = heap.pop().unwrap();
				let tree_node = heap_node.tree_node;

				let distance = heap_node.min_distance;

				if distance > min_distance {
					break;
				}

				if tree_node.is_leaf {
					min_distance = distance;
				} else {
					heap.push(HeapNode::new(tree_node.left.as_ref().unwrap(), point));
					heap.push(HeapNode::new(tree_node.right.as_ref().unwrap(), point));
				}
			}

			return min_distance;
		}
	}



	struct SegmentTreeNode {
		bbox: Bbox,
		is_leaf: bool,
		left: Option<Rc<SegmentTreeNode>>,
		right: Option<Rc<SegmentTreeNode>>,
		segments: Option<Vec<Rc<Segment>>>,
	}



	struct HeapNode<'a> {
		tree_node: &'a SegmentTreeNode,
		min_distance: f32,
	}

	impl HeapNode<'_> {
		fn new<'a>(tree_node: &'a SegmentTreeNode, point: &'a Point) -> HeapNode<'a> {
			let min_distance;
			if tree_node.is_leaf {
				min_distance = min_segments_distance(tree_node.segments.as_ref().unwrap(), &point);
			} else {
				min_distance = tree_node.bbox.distance_to(&point);
			}
			return HeapNode {
				tree_node,
				min_distance,
			};
		}
	}

	impl PartialEq for HeapNode<'_> {
		fn eq(&self, other: &Self) -> bool {
			return self.min_distance == other.min_distance;
		}
	}

	impl Eq for HeapNode<'_> {}

	impl Ord for HeapNode<'_> {
		fn cmp(&self, other: &Self) -> Ordering {
			other.min_distance.total_cmp(&self.min_distance)
		}
	}

	impl PartialOrd for HeapNode<'_> {
		fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
			Some(self.cmp(other))
		}
	}



	fn min_segments_distance(segments: &Vec<Rc<Segment>>, point: &Point) -> f32 {
		let mut min_distance = f32::MAX;
		for segment in segments {
			let distance = min_segment_distance(&segment, &point);
			if distance < min_distance {
				min_distance = distance;
			}
		}
		return min_distance;
	}

	fn min_segment_distance(segment: &Segment, point: &Point) -> f32 {
		let pv = segment.p0; // v
		let pw = segment.p1; // w

		let dxwv = pw.x - pv.x;
		let dywv = pw.y - pv.y;
		let dxpv = point.x - pv.x;
		let dypv = point.y - pv.y;

		let l2 = dxwv * dxwv + dywv * dywv;
		if l2 == 0.0 {
			return (dxpv * dxpv * point.scale_x2 + dypv * dypv).sqrt() * DEG2METERS;
		}

		let t = ((dxpv * dxwv - dypv * dywv) / l2).max(0.0).min(1.0);

		let dx = pv.x + t * dxwv - point.x;
		let dy = pv.y + t * dywv - point.y;

		return (dx * dx * point.scale_x2 + dy * dy).sqrt() * DEG2METERS;
	}
}
