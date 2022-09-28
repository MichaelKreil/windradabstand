/*
	GeoJSON to Signed Distance Field (Image) as PNG Tiles:
	1. load GeoJSON
	3. add segments to R-Tree
	4. for every pixel:
		4.1. calc distance to nearest segment in meters
		4.2. limit distance to maxDistance
		4.3. if inside polygon: negative distance
	5. save as png tiles
*/

use std::env;
use std::fs;
use json;
use json::JsonValue;
use std::time::Instant;

const PI:f64 = std::f64::consts::PI;

#[derive(Debug)]
struct Arguments {
	filename: String,
	zoom: u32,
	x0: u32,
	y0: u32,
	n: u32,
	tile_size: u32,
}
struct BBox {
	min: Point,
	max: Point,
}
struct Point {
	x: f64,
	y: f64,
}
struct Polyline {
	points: Vec<Point>,
	bbox: BBox,
}
struct Polygon {
	rings: Vec<Polyline>,
	bbox: BBox,
}
struct Collection {
	polygons: Vec<Polygon>
}
struct Segment{
	p0: Point,
	p1: Point,
}
struct Segments {
	segments: Vec<Segment>
}
struct Image {
	size: u32,
	x_offset: u32,
	y_offset: u32,
	scale: u32,
	data: Vec<f64>,
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

impl Point {
	fn new() -> Point {
		return Point{x:0.0,y:0.0}
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

impl Collection {
	fn new() -> Collection {
		return Collection{polygons:Vec::new()}
	}
	fn fill_from_json(&mut self, filename:&String) {
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

impl Segments {
	fn new() -> Segments {
		return Segments{segments: Vec::new()}
	}
	fn fill_from_collection(&mut self, collection:&Collection) {
		collection.extract_segments_to(self)
	}
	fn add(&mut self, p0:&Point, p1:&Point) {
		self.segments.push(Segment{
			p0:(*p0).clone(),
			p1:(*p1).clone(),
		});
	}
}

impl Image {
	fn new(size:u32, zoom:u32, x_offset:u32, y_offset:u32) -> Image {
		let scale = 2^zoom;
		let length:usize = (size*size).try_into().unwrap();

		return Image{
			size,
			x_offset,
			y_offset,
			scale,
			data: Vec::with_capacity(length),
		}
	}
	fn get_pixel_as_point(&self, x:u32, y:u32) -> Point {
		return Point{
			x: demercator_x(f64::from(x-self.x_offset)/f64::from(self.scale)),
			y: demercator_y(f64::from(y-self.y_offset)/f64::from(self.scale)),
		}
	}
}

fn main() {
	let arguments = parse_arguments();
	println!("{:?}", arguments);
	
	let mut polygons = Collection::new();

	//let now = Instant::now();
	polygons.fill_from_json(&arguments.filename);
	//let elapsed_time = now.elapsed();
	//println!("took {} ms.", elapsed_time.as_millis());

	let mut segments = Segments::new();
	segments.fill_from_collection(&polygons);

	let size = arguments.tile_size * arguments.n;
	let mut image = Image::new(size, arguments.zoom, arguments.x0, arguments.y0);
	
	for y in 0..size-1 {
		for x in 0..size-1 {
			let point = image.get_pixel_as_point(x,y);
			//let distance = segments.get_min_distance(point);
			//image.set_pixel_value(x,y,distance);
		}
	}

	//println!("{:?}", polygons);
	/*
	let segments = getSegments(polygons);
	let rtreePolygons = generateRTree(polygons);
	let ctreeSegments = generateRTree(segments);
	let image = initializeImage();
	for pixel in image {
		let coords = pixel.getCoords();
		let distance = getMinDistance(coords, ctreeSegments, coords);

		if (distance > arguments.maxDistance) {
			distance = arguments.maxDistance;
		}

		if (isInside(coords, rtreePolygons)) {
			distance = -distance;
		}

		pixel.setValue(distance);
	}
	image.saveTiles();
	*/
}

fn parse_arguments() -> Arguments {
	let args: Vec<String> = env::args().collect();
	return Arguments {
		filename: args.get(2).unwrap_or(&"/Users/michaelkreil/Projekte/privat/ZSHH/windradabstand/data/4_rules_geo_basis/tile.geojson".to_string()).to_string(),
		zoom:     args.get(3).unwrap_or( &"14".to_string()).parse().unwrap(),
		x0:       args.get(4).unwrap_or(  &"0".to_string()).parse().unwrap(),
		y0:       args.get(5).unwrap_or(  &"0".to_string()).parse().unwrap(),
		n:        args.get(6).unwrap_or( &"16".to_string()).parse().unwrap(),
		tile_size:args.get(7).unwrap_or(&"256".to_string()).parse().unwrap(),
	};
}

fn demercator_x(x:f64) -> f64 {
	return x*360.0 - 180.0
}

fn demercator_y(y:f64) -> f64 {
	return (((1.0 - y * 2.0) * PI).exp().atan() * 4.0 / PI - 1.0) * 90.0
}
