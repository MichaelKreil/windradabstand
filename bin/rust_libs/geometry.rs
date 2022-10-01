
use json;
use json::JsonValue;
use std::collections::BinaryHeap;
use std::fs;
use std::cmp::Ordering;



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
	fn from_segments(segments:&Vec<&Segment>) -> BBox {
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
		let dx = (self.min.x - point.x).max(point.x - self.max.x).max(0.0);
		let dy = (self.min.y - point.y).max(point.y - self.max.y).max(0.0);

		//println!("distance_to {} {}", dx, dy);
		//println!("{:?} {:?}", self, point);
		return (dx*dx + dy*dy).sqrt()
	}
}



#[derive(Copy,Clone)]
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
}



pub struct Collection<'a> {
	polygons: Vec<Polygon>,
	segments: Segments<'a>,
}

impl<'a> Collection<'a> {
	pub fn new() -> Collection<'a> {
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
	pub fn extract_segments<'b>(&'b mut self) {
		self.segments.copy_from_collection(&self.polygons);
	}
	pub fn get_min_distance(&self, point:&Point) -> f64 {
		return self.segments.get_min_distance(&point);
	}
}


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



struct Segments<'a> {
	segmentList: Vec<Segment>,
	segments: Vec<&'a Segment>,
	root: Option<SegmentTreeNode<'a>>
}

impl<'a> Segments<'a> {
	/*
	fn add(&mut self, p0:Point, p1:Point) {
		self.segmentList.push(Segment::new(p0, p1));
	}*/

	fn copy_from_collection(&'a mut self, polygons:&Vec<Polygon>) {
		for polygon in polygons {
			for ring in &polygon.rings {
				let n = ring.points.len()-2;
				for i in 0..n {
					let p0 = ring.points[i];
					let p1 = ring.points[i+1];
					self.segmentList.push(Segment::new(p0, p1));
				}
			}
		}

		for segment in &self.segmentList {
			self.segments.push(&segment);
		}

		let segments = &self.segments;
		let node = SegmentTreeNode::new(segments);
		self.root = Some(node);
	}
	pub fn new() -> Segments<'a> {
		return Segments{
			segmentList: Vec::new(),
			segments: Vec::new(),
			root: None
		}
	}
	pub fn get_min_distance(&self, point:&Point) -> f64 {
		let mut heap = BinaryHeap::new();
		let root = (self.root).as_ref().unwrap().clone();
		heap.push(HeapNode::new(&root, point));

		let mut min_distance = f64::MAX;

		while !heap.is_empty() {
			let heap_node = heap.pop().unwrap();
			let tree_node = heap_node.tree_node;

			let distance = heap_node.min_distance;

			if distance > min_distance {
				break
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



struct SegmentTreeNode<'a> {
	bbox: BBox,
	is_leaf: bool,
	left:  Option<Box<SegmentTreeNode<'a>>>,
	right: Option<Box<SegmentTreeNode<'a>>>,
	segments: Option<Vec<&'a Segment>>,
}

impl<'a> SegmentTreeNode<'a> {
	fn new(segments:&Vec<&'a Segment>) -> SegmentTreeNode<'a> {
		let bbox = BBox::from_segments(segments);
		let center = bbox.center();
		let mut segments1:Vec<&Segment> = Vec::new();
		let mut segments2:Vec<&Segment> = Vec::new();
		if bbox.width() > bbox.height() {
			for segment in segments.iter() {
				if segment.center.x < center.x {
					segments1.push(segment);
				} else {
					segments2.push(segment);
				}
			}
		} else {
			for segment in segments.iter() {
				if segment.center.y < center.y {
					segments1.push(segment);
				} else {
					segments2.push(segment);
				}
			}
		}

		if segments1.len() == 0 {
			return SegmentTreeNode{
				bbox,
				is_leaf: true,
				left:  None,
				right: None,
				segments: Some(segments2),
			};
		}

		if segments2.len() == 0 {
			return SegmentTreeNode{
				bbox,
				is_leaf: true,
				left:  None,
				right: None,
				segments: Some(segments1),
			};
		}

		return SegmentTreeNode{
			bbox,
			is_leaf: false,
			left:  Some(Box::new(SegmentTreeNode::new(&segments1))),
			right: Some(Box::new(SegmentTreeNode::new(&segments2))),
			segments: None,
		}
	}
}

struct HeapNode<'a> {
	tree_node: &'a SegmentTreeNode<'a>,
	min_distance: f64,
}

impl HeapNode<'_> {
	fn new<'a>(tree_node:&'a SegmentTreeNode, point:&'a Point) -> HeapNode<'a> {
		let min_distance;
		if tree_node.is_leaf {
			min_distance = min_segments_distance(tree_node.segments.as_ref().unwrap(), &point);
		} else {
			min_distance = tree_node.bbox.distance_to(&point);
		}
		return HeapNode{
			tree_node,
			min_distance,
		}
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
	fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

fn min_segments_distance(segments:&Vec<&Segment>, point:&Point) -> f64 {
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
	let pv = segment.p0; // v
	let pw = segment.p1; // w
	
	let dxwv = pw.x - pv.x;
	let dywv = pw.y - pv.y;
	let dxpv = point.x - pv.x;
	let dypv = point.y - pv.y;
	
	let l2 = dxwv*dxwv + dywv*dywv;
	if l2 == 0.0 {
		return (dxpv*dxpv + dypv*dypv).sqrt();
	}
	
	let t = ((dxpv*dxwv - dypv*dywv) / l2).max(0.0).min(1.0);

	let dx = pv.x + t * dxwv - point.x;
	let dy = pv.y + t * dywv - point.y;
	
	return (dx*dx + dy*dy).sqrt();
}
