/*
	GeoJSON to Signed Distance Field (SDF) as PNG Tiles:
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

#[derive(Debug)]
struct Arguments {
	filename: String,
	z: u32,
	y: u32,
	x: u32,
	n: u32,
	size: u32,
}

struct BBox {
	min: Point,
	max: Point,
}
struct Point {
	x: f32,
	y: f32,
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


impl BBox {
	fn new() -> BBox {
		BBox{
			min: Point{x:f32::MAX, y:f32::MAX},
			max: Point{x:f32::MIN, y:f32::MIN},
		}
	}
}

impl Point {
	fn import_from_json(coordinates_point: &JsonValue) -> Point {
		return Point{
			x: coordinates_point[0].as_f32().unwrap(),
			y: coordinates_point[1].as_f32().unwrap(),
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
		return polyline;
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
		return polygon;
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
}

fn main() {
	let arguments = parse_arguments();
	println!("{:?}", arguments);
	
	let mut polygons = Collection::new();

	let now = Instant::now();
	polygons.fill_from_json(&arguments.filename);
	let elapsed_time = now.elapsed();
	println!("took {} ms.", elapsed_time.as_millis());

	//let mut segments = 
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
		z:        args.get(3).unwrap_or( &"14".to_string()).parse().unwrap(),
		y:        args.get(4).unwrap_or(  &"0".to_string()).parse().unwrap(),
		x:        args.get(5).unwrap_or(  &"0".to_string()).parse().unwrap(),
		n:        args.get(6).unwrap_or( &"16".to_string()).parse().unwrap(),
		size:     args.get(7).unwrap_or(&"256".to_string()).parse().unwrap(),
	};
}
