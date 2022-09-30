
use std::fs;
use json;
use json::JsonValue;
use std::rc::Rc;




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
	fn from_segments(segments:&Vec<Rc<Segment>>) -> BBox {
		let mut bbox = BBox::new();
		for segment in segments {
			bbox.add_point(&segment.p0);
			bbox.add_point(&segment.p1);
		}
		return bbox;
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
	fn center(&self) -> Point {
		return Point{
			x:(self.min.x+self.max.x)/2.0,
			y:(self.min.y+self.max.y)/2.0,
		}
	}
	fn width(&self) -> f64 {
		return self.max.x-self.min.x
	}
	fn height(&self) -> f64 {
		return self.max.y-self.min.y
	}
}



#[derive(Debug,Copy,Clone)]
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
			let p0 = self.points[i];
			let p1 = self.points[i+1];
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



pub struct Collection {
	polygons: Vec<Polygon>,
	segments: Segments,
}

impl Collection {
	pub fn new() -> Collection {
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


#[derive(Debug)]
struct Segment {
	p0: Point,
	p1: Point,
	center: Point,
}

impl Segment {
	fn new(p0:Point, p1:Point) -> Segment {
		return Segment{
			p0,
			p1,
			center: Point{
				x: (p0.x + p1.x) / 2.0,
				y: (p0.y + p1.y) / 2.0,
			}
		};
	}
}



struct Segments {
	segments: Vec<Rc<Segment>>,
	tree_root: Option<SegmentTreeNode>
}

impl Segments {
	fn add(&mut self, p0:Point, p1:Point) {
		self.segments.push(Rc::new(Segment::new(p0, p1)));
	}
	pub fn new() -> Segments {
		return Segments{
			segments: Vec::new(),
			tree_root: None
		}
	}
	fn init_tree(&mut self) {
		let node = self.create_node(&self.segments);
		self.tree_root.insert(node);
	}
	fn create_node(&self, segments:&Vec<Rc<Segment>>) -> SegmentTreeNode {
		let bbox = BBox::from_segments(segments);
		let center = bbox.center();
		let mut segments1:Vec<Rc<Segment>> = Vec::new();
		let mut segments2:Vec<Rc<Segment>> = Vec::new();
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

		if (segments1.len() == 0) {
			return SegmentTreeNode{
				bbox: None,
				is_leaf: true,
				left: None,
				right: None,
				segments: Some(segments2),
			};
		}

		if (segments2.len() == 0) {
			return SegmentTreeNode{
				bbox: None,
				is_leaf: true,
				left: None,
				right: None,
				segments: Some(segments1),
			};
		}

		return SegmentTreeNode{
			bbox: Some(bbox),
			is_leaf: false,
			left: Some(Box::new(self.create_node(&segments1))),
			right: Some(Box::new(self.create_node(&segments2))),
			segments: None,
		}
	}
	pub fn get_min_distance(&self, _point:Point) -> f64 {
		return 0.0;
	}
}



struct SegmentTreeNode {
	bbox: Option<BBox>,
	is_leaf: bool,
	left: Option<Box<SegmentTreeNode>>,
	right: Option<Box<SegmentTreeNode>>,
	segments: Option<Vec<Rc<Segment>>>,
}
