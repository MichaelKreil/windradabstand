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

#[derive(Debug)]
struct Arguments {
	filename: String,
	z: u32,
	y: u32,
	x: u32,
	n: u32,
	size: u32,
}

fn main() {
	let arguments = parse_arguments();
	println!("{:?}", arguments);
	/*
	let polygons = loadGeometry(arguments.filename);
	let segments = getSegments(polygons);
	let treePolygons = generateRTree(polygons);
	let treeSegments = generateRTree(segments);
	let image = initializeImage();
	for pixel in image {
		let coords = pixel.getCoords();
		let distance = getMinDistance(coords, treeSegments, coords);

		if (distance > arguments.maxDistance) {
			distance = arguments.maxDistance;
		}

		if (isInside(coords, treePolygons)) {
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
		filename: args.get(2).unwrap_or(&"../data/9_sdf/test.geojson".to_string()).to_string(),
		z:        args.get(3).unwrap_or(&"14".to_string()).parse().unwrap(),
		y:        args.get(4).unwrap_or(&"0".to_string()).parse().unwrap(),
		x:        args.get(5).unwrap_or(&"0".to_string()).parse().unwrap(),
		n:        args.get(6).unwrap_or(&"16".to_string()).parse().unwrap(),
		size:     args.get(7).unwrap_or(&"256".to_string()).parse().unwrap(),
	};
}
