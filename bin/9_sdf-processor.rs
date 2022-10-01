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
use std::time::Instant;
use std::path::Path;

#[path = "rust_libs/geometry.rs"]
mod geometry;

#[path = "rust_libs/image.rs"]
mod image;

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
	
	let mut collection:geometry::Collection = geometry::Collection::new();

	//let now = Instant::now();
	collection.fill_from_json(&arguments.filename);
	//let elapsed_time = now.elapsed();
	//println!("took {} ms.", elapsed_time.as_millis());

	collection.extract_segments();

	let size = arguments.tile_size * arguments.n;
	let mut image = image::Image::new(size, arguments.zoom, arguments.x0, arguments.y0);
	

	let now = Instant::now();
	for y in 0..size-1 {
		for x in 0..size-1 {
			let point = image.get_pixel_as_point(x,y);
			let distance = collection.get_min_distance(&point);
			image.set_pixel_value(x,y,distance);
		}
	}
	let elapsed_time = now.elapsed();
	println!("took {} ms.", elapsed_time.as_millis());

	let now = Instant::now();
	image.save(Path::new("test.png"));
	let elapsed_time = now.elapsed();
	println!("image.save: {} ms", elapsed_time.as_millis());

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
		zoom:     args.get(3).unwrap_or(  &"11".to_string()).parse().unwrap(),
		x0:       args.get(4).unwrap_or(&"1069".to_string()).parse().unwrap(),
		y0:       args.get(5).unwrap_or( &"697".to_string()).parse().unwrap(),
		n:        args.get(6).unwrap_or(   &"8".to_string()).parse().unwrap(),
		tile_size:args.get(7).unwrap_or( &"256".to_string()).parse().unwrap(),
	};
}
