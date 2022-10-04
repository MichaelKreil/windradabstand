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

use std::env;
use std::path::Path;
use std::time::Instant;

use crate::geometry::geometry::*;
use crate::geoimage::geoimage::*;



#[derive(Debug)]
struct Arguments {
	filename: String,
	zoom: usize,
	x0: usize,
	y0: usize,
	n: usize,
	tile_size: usize,
}

fn main() {
	env::set_var("RUST_BACKTRACE", "1");

	let arguments = parse_arguments();
	println!("{:?}", arguments);

	let mut collection = Collection::new();

	collection.fill_from_json(&arguments.filename);
	collection.extract_segments();

	let size = arguments.tile_size * arguments.n;
	let mut image = GeoImage::new(size, arguments.zoom, arguments.x0, arguments.y0);

	let now = Instant::now();
	for y in 0..size - 1 {
		for x in 0..size - 1 {
			let point = image.get_pixel_as_point(x, y);
			let distance = collection.get_min_distance(point);
			image.set_pixel_value(x, y, distance);
		}
	}
	let elapsed_time = now.elapsed();
	println!("took {} ms.", elapsed_time.as_millis());

	let now = Instant::now();
	image.save(Path::new("test.png"));
	let elapsed_time = now.elapsed();
	println!("image.save: {} ms", elapsed_time.as_millis());
}

fn parse_arguments() -> Arguments {
	let args: Vec<String> = env::args().collect();
	return Arguments {
		filename: args.get(2).unwrap_or(&"/Users/michaelkreil/Projekte/privat/ZSHH/windradabstand/data/4_rules_geo_basis/tile.geojson".to_string()).to_string(),
		zoom:     args.get(3).unwrap_or(  &"11".to_string()).parse().unwrap(),
		x0:       args.get(4).unwrap_or(&"1069".to_string()).parse().unwrap(),
		y0:       args.get(5).unwrap_or( &"697".to_string()).parse().unwrap(),
		n:        args.get(6).unwrap_or(   &"8".to_string()).parse().unwrap(),
		tile_size:args.get(7).unwrap_or( &"256".to_string()).parse().unwrap(),
	};
}
