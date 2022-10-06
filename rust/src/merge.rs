
#[path = "lib/geometry.rs"]
pub mod geometry;

#[path = "lib/geoimage.rs"]
pub mod geoimage;

use json;
use std::env;
use std::path::Path;

use crate::geoimage::geoimage::*;

#[derive(Debug)]
struct Arguments {
	folder_png: String,
	folder_bin: String,
	zoom: u32,
	x0: u32,
	y0: u32
}

fn main() {
	let args = parse_arguments();
	println!("args: {:?}", args);

	let x = args.x0*2;
	let y = args.y0*2;
	let z = args.zoom+1;
	let folder_bin = Path::new(&args.folder_bin);

	let mut images = Vec::new();
	images.push(GeoImage::load(GeoImage::calc_path(folder_bin, z, x  , y  , ".bin").as_path()));
	images.push(GeoImage::load(GeoImage::calc_path(folder_bin, z, x+1, y  , ".bin").as_path()));
	images.push(GeoImage::load(GeoImage::calc_path(folder_bin, z, x  , y+1, ".bin").as_path()));
	images.push(GeoImage::load(GeoImage::calc_path(folder_bin, z, x+1, y+1, ".bin").as_path()));

	let image = GeoImage::merge(images);

	image.export_to(Path::new(&args.folder_png));

	let thumb = image.scaled_down_clone(image.size/2);
	thumb.save_to(folder_bin);
}

fn parse_arguments() -> Arguments {
	let args: Vec<String> = env::args().collect();
	//println!("args {:?}", args);
	let json_string:&String = &args.get(1).unwrap().to_string();
	let obj = &json::parse(json_string).unwrap();
	//println!("obj {}", obj);

	return Arguments {
		folder_png:   parse_str(obj, "folder_png"),
		folder_bin:   parse_str(obj, "folder_bin"),
		zoom:         parse_u32(obj, "zoom"),
		x0:           parse_u32(obj, "x0"),
		y0:           parse_u32(obj, "y0")
	};

	fn parse_str(obj:&json::JsonValue, name:&str) -> String {
		//println!("   obj {}", obj);
		return obj[name].as_str().unwrap().to_string();
	}

	fn parse_u32(obj:&json::JsonValue, name:&str) -> u32 {
		return obj[name].as_u32().unwrap();
	}
}
