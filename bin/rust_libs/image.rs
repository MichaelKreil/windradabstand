
#[path = "geometry.rs"]
mod geometry;
use crate::geometry::{Point};



const PI:f64 = std::f64::consts::PI;




pub struct Image {
	size: usize,
	x_offset: usize,
	y_offset: usize,
	scale: f64,
	data: Vec<f64>,
}

impl Image {
	pub fn new(size:usize, zoom:usize, x_offset:usize, y_offset:usize) -> Image {
		let scale = (2^zoom) as f64;
		let length:usize = (size*size).try_into().unwrap();
		println!("size:{} length:{}", size, length);

		let mut image = Image{
			size,
			x_offset,
			y_offset,
			scale,
			data: Vec::with_capacity(length),
		};
		image.data.resize(length, f64::MAX);

		return image;
	}
	pub fn get_pixel_as_point(&self, x:usize, y:usize) -> Point {
		return Point::new(
			demercator_x(((x-self.x_offset) as f64)/self.scale),
			demercator_y(((y-self.y_offset) as f64)/self.scale),
		)
	}
	pub fn set_pixel_value(&mut self, x:usize, y:usize, distance:f64) {
		if x < 0 { panic!(); }
		if x >= self.size { panic!(); }
		if y < 0 { panic!(); }
		if y >= self.size { panic!(); }
		self.data[x + y*self.size] = distance;
	}
}




fn demercator_x(x:f64) -> f64 {
	return x*360.0 - 180.0
}

fn demercator_y(y:f64) -> f64 {
	return (((1.0 - y * 2.0) * PI).exp().atan() * 4.0 / PI - 1.0) * 90.0
}
