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

struct Point {
	x: f64,
	y: f64,
}
struct Polyline {
	points: Vec<Point>
}
struct Polygon {
	rings: Vec<Polyline>
}
struct Collection {
	polygons: Vec<Polygon>
}

impl Polyline {
	fn new(coordLine: &JsonValue) -> Polyline {
		let mut polyline = Polyline{points: Vec::new()};
		for coordPoint in coordLine.members() {
			polyline.points.push(Point{
				x: coordPoint[0].as_f64().unwrap(),
				y: coordPoint[1].as_f64().unwrap(),
			})
		}
		return polyline;
	}
}

impl Polygon {
	fn new(coordPolygon: &JsonValue) -> Polygon {
		let mut polygon = Polygon{rings: Vec::new()};
		for coordRing in coordPolygon.members() {
			polygon.rings.push(Polyline::new(coordRing))
		}
		return polygon;
	}
}

impl Collection {
	fn new() -> Collection {
		Collection{polygons:Vec::new()}
	}
	fn import(&mut self, filename:&String) {
		println!("{:?}", filename);
	
		let contents:&str = &fs::read_to_string(filename).unwrap();
		let data = json::parse(contents).unwrap();
		let features = &data["features"];
		for feature in features.members() {
			let geometry = &feature["geometry"];
			let coordinates = &geometry["coordinates"];
			let geometry_type = geometry["type"].as_str().unwrap();

			match geometry_type {
				"Polygon" => self.polygons.push(Polygon::new(coordinates)),
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
	polygons.import(&arguments.filename);
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
