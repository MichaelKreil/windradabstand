
use std::fs;
use json;
use json::JsonValue;




struct BBox {
	min: Point,
	max: Point,
}

impl BBox {
	fn new() -> BBox {
		BBox{
			min: Point{x:f64::MAX, y:f64::MAX},
			max: Point{x:f64::MIN, y:f64::MIN},
		}
	}
	fn add_point(&mut self, point:&Point) {
		if self.min.x > point.x { self.min.x = point.x };
		if self.min.y > point.y { self.min.y = point.y };
		if self.max.x < point.x { self.max.x = point.x };
		if self.max.y < point.y { self.max.y = point.y };
	}
	fn add_bbox(&mut self, bbox:&BBox) {
		if self.min.x > bbox.min.x { self.min.x = bbox.min.x };
		if self.min.y > bbox.min.y { self.min.y = bbox.min.y };
		if self.max.x < bbox.max.x { self.max.x = bbox.max.x };
		if self.max.y < bbox.max.y { self.max.y = bbox.max.y };
	}
}



pub struct Point {
	x: f64,
	y: f64,
}

impl Point {
	pub fn new(x:f64, y:f64) -> Point {
		return Point{x,y}
	}
	fn import_from_json(coordinates_point: &JsonValue) -> Point {
		return Point{
			x: coordinates_point[0].as_f64().unwrap(),
			y: coordinates_point[1].as_f64().unwrap(),
		}
	}
	fn clone(&self) -> Point {
		return Point{
			x: self.x,
			y: self.y,
		}
	}
}



struct Polyline {
	points: Vec<Point>,
	bbox: BBox,
}

impl Polyline {
	fn new() -> Polyline {
		return Polyline{points: Vec::new(), bbox:BBox::new()};
	}
	fn import_from_json(coordinates_line: &JsonValue) -> Polyline {
		let mut polyline = Polyline::new();
		for coordinates_point in coordinates_line.members() {
			polyline.points.push(Point::import_from_json(coordinates_point))
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
	fn extract_segments_to(&self, segments:&mut Segments) {
		for i in 0..(self.points.len()-2) {
			let p0 = &self.points[i];
			let p1 = &self.points[i+1];
			segments.add(p0, p1);
		}
	}
}



struct Polygon {
	rings: Vec<Polyline>,
	bbox: BBox,
}

impl Polygon {
	fn new() -> Polygon {
		return Polygon{rings: Vec::new(), bbox:BBox::new()};
	}
	fn import_from_json(coordinates_polygon: &JsonValue) -> Polygon {
		let mut polygon = Polygon::new();
		for coordinates_ring in coordinates_polygon.members() {
			polygon.rings.push(Polyline::import_from_json(coordinates_ring))
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
	fn extract_segments_to(&self, segments:&mut Segments) {
		for ring in &self.rings {
			ring.extract_segments_to(segments);
		}
	}
}



pub struct Collection<'a> {
	polygons: Vec<Polygon>,
	segments: Segments<'a>,
}

impl Collection<'_> {
	pub fn new() -> Collection<'static> {
		return Collection{
			polygons:Vec::new(),
			segments:Segments::new(),
		}
	}
	pub fn fill_from_json(&mut self, filename:&String) {
		println!("{:?}", filename);
	
		let contents:&str = &fs::read_to_string(filename).unwrap();
		let data = json::parse(contents).unwrap();
		let features = &data["features"];
		for feature in features.members() {
			let geometry = &feature["geometry"];
			let coordinates = &geometry["coordinates"];
			let geometry_type = geometry["type"].as_str().unwrap();

			match geometry_type {
				"Polygon" => self.polygons.push(Polygon::import_from_json(coordinates)),
				_ => panic!("{}", geometry_type)
			}
		}
	}
	pub fn extract_segments(&mut self) {
		for polygon in &self.polygons {
			polygon.extract_segments_to(&mut self.segments);
		}
		self.segments.init_tree();
	}
	pub fn get_min_distance(&self, point:Point) -> f64 {
		return self.segments.get_min_distance(point);
	}
}



struct Segment<'a> {
	p0: &'a Point,
	p1: &'a Point,
}

impl Segment<'_> {
	fn new<'a>(p0:&'a Point, p1:&'a Point) -> Segment<'a> {
		return Segment{p0, p1};
	}
}



struct Segments<'a> {
	segments: Vec<Segment<'a>>,
	tree_root: Option<SegmentTreeNode<'a>>
}

impl Segments<'_> {
	fn add<'a>(&mut self, p0:&'a Point, p1:&'a Point) {
		self.segments.push(Segment::new(p0, p1));
	}
	pub fn new() -> Segments<'static> {
		return Segments{
			segments: Vec::new(),
			tree_root: None
		}
	}
	fn init_tree(&mut self) {
		let node = self.create_node(0, self.segments.len());
		self.tree_root.insert(node);
	}
	fn create_node(&mut self, _i0:usize, _i1:usize) -> SegmentTreeNode {
		let mut bbox = BBox::new();
		for segment in &self.segments {
			bbox.add_point(&segment.p0);
			bbox.add_point(&segment.p1);
		}

		let node = SegmentTreeNode{
			bbox,
			is_leaf: false,
			left: None,
			right: None,
			segment: None,
		};

		return node;
	}
	pub fn get_min_distance(&self, _point:Point) -> f64 {
		return 0.0;
	}
}



struct SegmentTreeNode<'a> {
	bbox: BBox,
	is_leaf: bool,
	left: Option<&'a SegmentTreeNode<'a>>,
	right: Option<&'a SegmentTreeNode<'a>>,
	segment: Option<Segment<'a>>,
}
