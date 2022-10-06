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

use crate::geoimage::geoimage::*;
use crate::geometry::geometry::*;

#[derive(Debug)]
struct Arguments {
	filename_geo: String,
	folder_png: String,
	folder_bin: String,
	zoom: u32,
	x0: u32,
	y0: u32,
	n: u32,
	size: u32,
}

fn main() {
	let arguments = parse_arguments();
	println!("arguments: {:?}", arguments);

	let mut collection = Collection::new();

	collection.fill_from_json(Path::new(&arguments.filename_geo));
	collection.prepare_segment_lookup();

	let size = arguments.size * arguments.n;
	let mut image = GeoImage::new(size, arguments.zoom, arguments.x0, arguments.y0);

	for y in 0..size {
		for x in 0..size {
			let point = image.get_pixel_as_point(x, y);
			let distance = collection.get_min_distance(point);
			image.set_pixel_value(x, y, distance);
		}
	}

	image.export_tile_tree(arguments.size, Path::new(&arguments.folder_png));
	let thumb = image.scaled_down_clone(arguments.size/2);
	thumb.save_to(Path::new(&arguments.folder_bin));
}

fn parse_arguments() -> Arguments {
	let args: Vec<String> = env::args().collect();
	//println!("args {:?}", args);
	let json_string:&String = &args.get(1).unwrap().to_string();
	let obj = &json::parse(json_string).unwrap();
	//println!("obj {}", obj);

	return Arguments {
		filename_geo: parse_str(obj, "filename_geo"),
		folder_png:   parse_str(obj, "folder_png"),
		folder_bin:   parse_str(obj, "folder_bin"),
		zoom:         parse_u32(obj, "zoom"),
		x0:           parse_u32(obj, "x0"),
		y0:           parse_u32(obj, "y0"),
		n:            parse_u32(obj, "n"),
		size:         parse_u32(obj, "size")
	};

	fn parse_str(obj:&json::JsonValue, name:&str) -> String {
		//println!("   obj {}", obj);
		return obj[name].as_str().unwrap().to_string();
	}

	fn parse_u32(obj:&json::JsonValue, name:&str) -> u32 {
		return obj[name].as_u32().unwrap();
	}
}
