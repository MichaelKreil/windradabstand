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

#[path = "lib/geometry.rs"]
pub mod geometry;

#[path = "lib/geoimage.rs"]
pub mod geoimage;

use json;
use std::env;
use std::path::Path;
use std::time::Instant;

use crate::geoimage::geoimage::*;
use crate::geometry::geometry::*;

#[derive(Debug)]
struct Arguments {
	filename_geo_dyn: String,
	filename_geo_fix: String,
	folder_png: String,
	folder_bin: String,
	min_distance: f32,
	max_distance: f32,
	zoom: u32,
	x0: u32,
	y0: u32,
	n: u32,
	size: u32,
}

fn main() {
	let arguments = parse_arguments();
	//println!("arguments: {:?}", arguments);

	let start = Instant::now();
		let mut collection_dyn = Collection::new();
		collection_dyn.fill_from_json(Path::new(&arguments.filename_geo_dyn));
	println!("collection_dyn.fill_from_json: {:?}", start.elapsed());

	let start = Instant::now();
		let mut collection_fix = Collection::new();
		collection_fix.fill_from_json(Path::new(&arguments.filename_geo_fix));
	println!("collection_fix.fill_from_json: {:?}", start.elapsed());

	let size = arguments.size * arguments.n;
	let mut image = GeoImage::new(size, arguments.zoom, arguments.x0, arguments.y0);

	let point0 = image.get_point_min();
	let point1 = image.get_point_max();

	let start = Instant::now();
		collection_dyn.init_lookup(point0, point1, 1024);
	println!("collection_dyn.init_lookup: {:?}", start.elapsed());

	let start = Instant::now();
		collection_fix.init_lookup(point0, point1, 1024);
	println!("collection_dyn.init_lookup: {:?}", start.elapsed());

	let start = Instant::now();
		image.fill_with_min_distances(0, &collection_dyn, arguments.min_distance, arguments.max_distance);
	println!("image.fill_with_min_distances(0): {:?}", start.elapsed());

	let start = Instant::now();
		let v = arguments.max_distance - arguments.min_distance;
		image.fill_with_min_distances(1, &collection_fix, -v/2.0, v/2.0);
	println!("image.fill_with_min_distances(1): {:?}", start.elapsed());

	let start = Instant::now();
		image.export_tile_tree(arguments.size, Path::new(&arguments.folder_png), ".png");
	println!("image.export_tile_tree: {:?}", start.elapsed());

	let start = Instant::now();
		let thumb = image.scaled_down_clone(arguments.size/2);
	println!("image.scaled_down_clone: {:?}", start.elapsed());

	let start = Instant::now();
		thumb.export_to(Path::new(&arguments.folder_bin), ".bin");
	println!("thumb.export_to: {:?}", start.elapsed());
}

fn parse_arguments() -> Arguments {
	let args: Vec<String> = env::args().collect();
	//println!("args {:?}", args);
	let json_string:&String = &args.get(1).unwrap().to_string();
	let obj = &json::parse(json_string).unwrap();
	//println!("obj {}", obj);

	return Arguments {
		filename_geo_dyn: parse_str(obj, "filename_geo_dyn"),
		filename_geo_fix: parse_str(obj, "filename_geo_fix"),
		folder_png:       parse_str(obj, "folder_png"),
		folder_bin:       parse_str(obj, "folder_bin"),
		min_distance:     parse_f32(obj, "min_distance"),
		max_distance:     parse_f32(obj, "max_distance"),
		zoom:             parse_u32(obj, "zoom"),
		x0:               parse_u32(obj, "x0"),
		y0:               parse_u32(obj, "y0"),
		n:                parse_u32(obj, "n"),
		size:             parse_u32(obj, "size")
	};

	fn parse_str(obj:&json::JsonValue, name:&str) -> String {
		return obj[name].as_str().unwrap().to_string();
	}

	fn parse_u32(obj:&json::JsonValue, name:&str) -> u32 {
		return obj[name].as_u32().unwrap();
	}

	fn parse_f32(obj:&json::JsonValue, name:&str) -> f32 {
		return obj[name].as_f32().unwrap();
	}
}
