
use json;
use json::JsonValue;
use std::collections::BinaryHeap;
use std::fs;
use std::rc::Rc;
use std::cmp::Ordering;



#[derive(Debug)]
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
	fn distance_to(&self, point:&Point) -> f64 {
		let dx = (self.min.x - point.x).min(point.x - self.max.x).min(0.0);
		let dy = (self.min.y - point.y).min(point.y - self.max.y).min(0.0);
		return (dx*dx + dy*dy).sqrt()
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
		return self.segments.get_min_distance(&point);
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
	root: Option<Rc<SegmentTreeNode>>
}

impl Segments {
	fn add(&mut self, p0:Point, p1:Point) {
		self.segments.push(Rc::new(Segment::new(p0, p1)));
	}
	pub fn new() -> Segments {
		return Segments{
			segments: Vec::new(),
			root: None
		}
	}
	fn init_tree(&mut self) {
		let node = self.create_node(&self.segments);
		self.root.insert(Rc::new(node));
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

		if segments1.len() == 0 {
			return SegmentTreeNode{
				bbox,
				is_leaf: true,
				left: None,
				right: None,
				segments: Some(segments2),
			};
		}

		if segments2.len() == 0 {
			return SegmentTreeNode{
				bbox,
				is_leaf: true,
				left: None,
				right: None,
				segments: Some(segments1),
			};
		}

		return SegmentTreeNode{
			bbox,
			is_leaf: false,
			left: Some(Rc::new(self.create_node(&segments1))),
			right: Some(Rc::new(self.create_node(&segments2))),
			segments: None,
		}
	}
	pub fn get_min_distance(&self, point:&Point) -> f64 {
		let mut heap = BinaryHeap::new();
		let root = (self.root).as_ref().unwrap().clone();
		heap.push(HeapNode::new(root, point));

		let mut min_distance = f64::MAX;

		while !heap.is_empty() {
			let heap_node = heap.pop().unwrap();
			let tree_node = heap_node.tree_node;

			let distance = heap_node.min_distance;
			if distance < min_distance {
				min_distance = distance;
				
				if !tree_node.is_leaf {
					heap.push(HeapNode::new((tree_node.left).as_ref().unwrap().clone(),  point));
					heap.push(HeapNode::new((tree_node.right).as_ref().unwrap().clone(), point));
				}
			}
		}

		return min_distance;
	}
}



#[derive(Debug)]
struct SegmentTreeNode {
	bbox: BBox,
	is_leaf: bool,
	left: Option<Rc<SegmentTreeNode>>,
	right: Option<Rc<SegmentTreeNode>>,
	segments: Option<Vec<Rc<Segment>>>,
}

#[derive(Debug)]
struct HeapNode {
	tree_node: Rc<SegmentTreeNode>,
	min_distance: f64,
}

impl HeapNode {
	fn new(tree_node:Rc<SegmentTreeNode>, point:&Point) -> HeapNode {
		let mut min_distance;
		if tree_node.is_leaf {
			min_distance = min_segments_distance(&tree_node.segments.as_ref().unwrap().clone(), &point);
		} else {
			min_distance = tree_node.bbox.distance_to(&point);
		}
		return HeapNode{
			tree_node,
			min_distance,
		}
	}
}

fn min_segments_distance(segments:&Vec<Rc<Segment>>, point:&Point) -> f64 {
	let mut min_distance = f64::MAX;
	for segment in segments {
		let distance = min_segment_distance(&segment, &point);
		if distance < min_distance {
			min_distance = distance;
		}
	}
	return min_distance;
}

fn min_segment_distance(segment:&Segment, point:&Point) -> f64 {
	println!("implement me");
	return 0.0;
}

impl PartialEq for HeapNode {
	fn eq(&self, other: &Self) -> bool {
		return self.min_distance == other.min_distance;
	}
}

impl Eq for HeapNode {}

impl Ord for HeapNode {
	fn cmp(&self, other: &Self) -> Ordering {
		other.min_distance.total_cmp(&self.min_distance)
	}
}

impl PartialOrd for HeapNode {
	fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}
