
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
		for i in 0..self.points.len()-2 {
			segments.add(&self.points[i], &self.points[i+1])
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
	polygons: Vec<Polygon>
}

impl Collection {
	pub fn new() -> Collection {
		return Collection{polygons:Vec::new()}
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
	fn extract_segments_to(&self, segments:&mut Segments) {
		for polygon in &self.polygons {
			polygon.extract_segments_to(segments);
		}
	}
}



struct Segment{
	p0: Point,
	p1: Point,
}



pub struct Segments {
	segments: Vec<Segment>
}

impl Segments {
	pub fn new() -> Segments {
		return Segments{segments: Vec::new()}
	}
	pub fn fill_from_collection(&mut self, collection:&Collection) {
		collection.extract_segments_to(self)
	}
	fn add(&mut self, p0:&Point, p1:&Point) {
		self.segments.push(Segment{
			p0:(*p0).clone(),
			p1:(*p1).clone(),
		});
	}
}
