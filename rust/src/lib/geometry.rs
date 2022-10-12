
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
	struct BBox {
		x_min: f32,
		y_min: f32,
		x_max: f32,
		y_max: f32,
	}

	impl BBox {
		fn new() -> BBox {
			BBox {
				x_min: 180.0,
				y_min:  90.0,
				x_max:-180.0,
				y_max: -90.0,
			}
		}
		fn from_coordinates(x_min:f32, y_min:f32, x_max:f32, y_max:f32) -> BBox {
			return BBox {x_min, y_min, x_max, y_max}
		}
		fn from_segments(segments: &Vec<Rc<Segment>>) -> BBox {
			let mut bbox = BBox::new();
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
		fn add_bbox(&mut self, bbox: &BBox) {
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
		fn center(&self) -> Point {
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
		fn overlaps_bbox(&self, bbox: &BBox) -> bool {
			if (bbox.x_min > self.x_max) || (bbox.x_max < self.x_min) {
				return false;
			}
			if (bbox.y_min > self.y_max) || (bbox.y_max < self.y_min) {
				return false;
			}
			return true;
		}
		fn covers_bbox(&self, bbox: &BBox) -> bool {
			if (bbox.x_min < self.x_min) || (bbox.x_max > self.x_max) {
				return false;
			}
			if (bbox.y_min < self.y_min) || (bbox.y_max > self.y_max) {
				return false;
			}
			return true;
		}
	}
	impl fmt::Display for BBox {
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
		bbox: BBox,
	}

	impl Polyline {
		fn new() -> Polyline {
			return Polyline {
				points: Vec::new(),
				bbox: BBox::new(),
			};
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
		fn overlaps_bbox(&self, bbox:&BBox) -> bool {
			//println!("Polyline overlap: points {:?}", self.points.len());

			if !self.bbox.overlaps_bbox(bbox) {
				return false;
			}
			
			//println!("Polyline overlap: bbox is overlaped by bbox");

			if self.contains_point(&bbox.top_left()) {
				//println!("Polyline overlap: ring contains bbox corner");
				return true;
			}

			if self.intersects_bbox(bbox) {
				//println!("Polyline overlap: intersection found :)");
				return true;
			} else {
				//println!("Polyline overlap: no intersection :(");
				return false;
			}
		}
		fn covers_bbox(&self, bbox:&BBox) -> bool {
			//println!("Polyline cover: points {:?}", self.points.len());

			if !self.bbox.covers_bbox(bbox) {
				return false;
			}

			//println!("Polyline cover: bbox is covered by bbox");

			if !self.contains_point(&bbox.top_left()) {
				//println!("Polyline cover: ring does not contain bbox corner");
				return false;
			}

			if self.intersects_bbox(bbox) {
				//println!("Polyline cover: intersection found :(");
				return false;
			} else {
				//println!("Polyline cover: no intersection :)");
				return true;
			}
		}
		fn intersects_bbox(&self, bbox:&BBox) -> bool {
			//let x0 = bbox.x_min;
			//let y0 = bbox.y_min;
			//let x1 = bbox.x_max;
			//let y1 = bbox.y_max;
			let pa = &Point::new(bbox.x_min, bbox.y_min);
			let pb = &Point::new(bbox.x_min, bbox.y_max);
			let pc = &Point::new(bbox.x_max, bbox.y_max);
			let pd = &Point::new(bbox.x_max, bbox.y_min);

			for i in 0..self.points.len()-1 {
				let p0 = &self.points[i];
				let p1 = &self.points[i+1];
				/*
				if intersect_vert(x0, y0, y1, p0, p1) {
					return true;
				}
				if intersect_vert(x1, y0, y1, p0, p1) {
					return true;
				}
				if intersect_hori(y0, x0, x1, p0, p1) {
					return true;
				}
				if intersect_hori(y1, x0, x1, p0, p1) {
					return true;
				}
				*/
				if intersects(pa, pb, p0, p1) {
					return true;
				}
				if intersects(pb, pc, p0, p1) {
					return true;
				}
				if intersects(pc, pd, p0, p1) {
					return true;
				}
				if intersects(pd, pa, p0, p1) {
					return true;
				}
			}
			return false;

			fn intersect_vert(x:f32, y0:f32, y1:f32, p0:&Point, p1:&Point) -> bool {
				if (p0.x < x) == (p1.x < x) { // Beide auf der gleichen Seite
					return false;
				}
				if (p0.y < y0) && (p1.y < y0) { // Beide zu weit unten
					return false;
				}
				if (p0.y > y1) && (p1.y > y1) { // Beide zu weit oben
					return false;
				}
				// Schnittpunkt berechnen
				let y = (x - p0.x) * (p1.y - p0.y) / (p1.x - p0.x) + p0.y;
				return (y >= y0) && (y <= y1);
			}

			fn intersect_hori(y:f32, x0:f32, x1:f32, p0:&Point, p1:&Point) -> bool {
				if (p0.y < y) == (p1.y < y) { // Beide auf der gleichen Seite
					return false;
				}
				if (p0.x < x0) && (p1.x < x0) { // Beide zu weit links
					return false;
				}
				if (p0.x > x1) && (p1.x > x1) { // Beide zu weit rechts
					return false;
				}
				// Schnittpunkt berechnen
				let x = (y - p0.y) * (p1.x - p0.x) / (p1.y - p0.y) + p0.x;
				return (x >= x0) && (x <= x1);
			}

			fn intersects(a0:&Point, a1:&Point, b0:&Point, b1:&Point) -> bool {
				let dx0 = a1.x - a0.x;
				let dx1 = b1.x - b0.x;
				let dy0 = a1.y - a0.y;
				let dy1 = b1.y - b0.y;
				let p0 = dy1 * (b1.x - a0.x) - dx1 * (b1.y - a0.y);
				let p1 = dy1 * (b1.x - a1.x) - dx1 * (b1.y - a1.y);
				let p2 = dy0 * (a1.x - b0.x) - dx0 * (a1.y - b0.y);
				let p3 = dy0 * (a1.x - b1.x) - dx0 * (a1.y - b1.y);
				return (p0 * p1 <= 0.0) && (p2 * p3 <= 0.0);
			}
		}
	}


	#[derive(Debug)]
	struct Polygon {
		rings: Vec<Polyline>,
		bbox: BBox,
	}

	impl Polygon {
		fn new() -> Polygon {
			return Polygon {
				rings: Vec::new(),
				bbox: BBox::new(),
			};
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
		fn overlaps_bbox(&self, bbox:&BBox) -> bool {
			//println!("Polygon overlap: points {:?}", self.rings[0].points.len());
			//println!("Polygon overlap: bbox {}", bbox);

			if !self.bbox.overlaps_bbox(bbox) {
				return false;
			}

			//println!("Polygon overlap: bbox is overlaped by bbox");

			if !self.rings[0].overlaps_bbox(bbox) {
				return false;
			}

			//println!("Polygon overlap: bbox is overlaped by outer ring");

			for i in 1..self.rings.len() {
				if self.rings[i].covers_bbox(bbox) {
					//println!("Polygon overlap: false");
					return false;
				}
			}

			//println!("Polygon overlap: true");
			return true;
		}
		fn covers_bbox(&self, bbox:&BBox) -> bool {
			//println!("Polygon cover: points {:?}", self.rings[0].points.len());
			//println!("Polygon cover: bbox {}", bbox);

			if !self.bbox.covers_bbox(bbox) {
				return false;
			}

			//println!("Polygon cover: bbox is covered by bbox");

			if !self.rings[0].covers_bbox(bbox) {
				//println!("Polygon cover: outer ring does not cover by bbox :(");
				return false;
			}

			//println!("Polygon cover: bbox is covered by outer ring");

			for i in 1..self.rings.len() {
				if self.rings[i].overlaps_bbox(bbox) {
					//println!("Polygon cover: false");
					return false;
				}
			}

			//println!("Polygon cover: true");
			return true;
		}
	}

	pub struct LookupCell {
		polygons: Vec<Rc<Polygon>>,
	}
	impl LookupCell {
		pub fn new() -> LookupCell {
			return LookupCell{polygons:Vec::new()};
		}
	}

	pub struct Collection {
		polygons: Vec<Rc<Polygon>>,
		segments: Segments,
		grid_lookup: Vec<LookupCell>,
		grid_empty: Vec<bool>,
		grid_covered: Vec<bool>,
		x0: f32,
		y0: f32,
		xs: f32,
		ys: f32,
		resolution: i32,
	}

	impl Collection {
		pub fn new() -> Collection {
			return Collection {
				polygons: Vec::new(),
				segments: Segments::new(),
				grid_lookup: Vec::new(),
				grid_empty: Vec::new(),
				grid_covered: Vec::new(),
				x0: 0.0,
				y0: 0.0,
				xs: 0.0,
				ys: 0.0,
				resolution: 0,
			};
		}
		pub fn fill_from_json(&mut self, filename: &Path) {
			//println!("filename {}", filename.display());
			let contents: &str = &fs::read_to_string(filename).unwrap();
			let data = json::parse(contents).unwrap();
			let features = &data["features"];
			for feature in features.members() {
				self.add_geometry(&feature["geometry"]);
			}
			self.prepare_segment_lookup();
		}
		fn add_geometry(&mut self, geometry:&JsonValue) {
			if !geometry["type"].is_string() {
				println!("{}", geometry);
			}

			let geometry_type = geometry["type"].as_str().unwrap();

			match geometry_type {
				"Polygon" => {
					self.polygons.push(
						Rc::new(Polygon::import_from_json(&geometry["coordinates"]))
					)
				},
				"MultiPolygon" => {
					for polygon in geometry["coordinates"].members() {
						self.polygons.push(
							Rc::new(Polygon::import_from_json(polygon))
						)
					}
				},
				"GeometryCollection" => {
					for sub_geometry in geometry["geometries"].members() {
						self.add_geometry(sub_geometry);
					}
				},
				"LineString" => { return },
				_ => {
					println!("{}", geometry);
					panic!("unknown geometry_type: '{}'", geometry_type)
				}
			}
		}
		pub fn prepare_segment_lookup(&mut self) {
			for polygon in &self.polygons {
				polygon.extract_segments_to(&mut self.segments);
			}
			self.segments.init_tree();
		}
		pub fn get_min_distance(&self, point: &Point, max_distance:f32) -> f32 {
			return self.segments.get_min_distance(point, max_distance);
		}
		pub fn init_lookup(&mut self, point_min:Point, point_max:Point, resolution:usize) {
			let size = resolution*resolution;
			self.grid_lookup.resize_with(size, || { LookupCell::new() });
			self.grid_empty.resize(size, true);
			self.grid_covered.resize(size, false);
			self.resolution = resolution as i32;

			self.x0 = point_min.x;
			self.y0 = point_min.y;
			self.xs = (resolution as f32 - 1.001)/(point_max.x - point_min.x);
			self.ys = (resolution as f32 - 1.001)/(point_max.y - point_min.y);
			
			for polygon in &self.polygons {
				let x0 = (((polygon.bbox.x_min - self.x0) * self.xs).floor() as i32).max(-1).min(self.resolution);
				let y0 = (((polygon.bbox.y_min - self.y0) * self.ys).floor() as i32).max(-1).min(self.resolution);
				let x1 = (((polygon.bbox.x_max - self.x0) * self.xs).floor() as i32).max(-1).min(self.resolution);
				let y1 = (((polygon.bbox.y_max - self.y0) * self.ys).floor() as i32).max(-1).min(self.resolution);

				for y in y0..=y1 {
					if (y < 0) || (y >= self.resolution) {
						continue;
					}
					for x in x0..=x1 {
						if (x < 0) || (x >= self.resolution) {
							continue;
						}

						//if (y != 100) || (x != 100) {
						//	continue;
						//}
						let bbox = &BBox::from_coordinates(
							self.x0 + ((x  ) as f32)/self.xs,
							self.y0 + ((y  ) as f32)/self.ys,
							self.x0 + ((x+1) as f32)/self.xs,
							self.y0 + ((y+1) as f32)/self.ys,
						);
						if polygon.overlaps_bbox(bbox) {
							let index = (x + y*self.resolution) as usize;
							self.grid_lookup[index].polygons.push(polygon.clone());
							self.grid_empty[index] = false;
							if polygon.covers_bbox(bbox) {
								self.grid_covered[index] = true;
							}
						}
					}
				}
			}
		}
		pub fn debug(&self) {
			println!("grid_empty {:?}", self.grid_empty);
			println!("grid_covered {:?}", self.grid_covered);
			//println!("grid_lookup {:?}", self.grid_lookup.map());
		}
		pub fn is_point_in_polygon(&self, point: &Point) -> bool {
			let x = ((point.x - self.x0)*self.xs).floor() as i32;
			let y = ((point.y - self.y0)*self.ys).floor() as i32;

			//println!("x,y = {},{} ({},{})", x, y, point.x, point.y);

			if x < 0 {
				panic!()
			}
			if y < 0 {
				panic!()
			}
			if x >= self.resolution {
				panic!()
			}
			if y >= self.resolution {
				panic!()
			}

			let index = (x + y*self.resolution) as usize;
			
			if self.grid_empty[index] {
				return false;
			}
			
			if self.grid_covered[index] {
				return true;
			}

			let polygons = &self.grid_lookup[index].polygons;
			//println!("{}/{}", polygons.len(), self.polygons.len());
			for polygon in polygons {
				if polygon.contains_point(point) {
					return true;
				}
			}

			return false;
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
			let bbox = BBox::from_segments(segments);
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
		bbox: BBox,
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
