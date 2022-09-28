
#[path = "geometry.rs"]
mod geometry;



const PI:f64 = std::f64::consts::PI;




pub struct Image {
	size: u32,
	x_offset: u32,
	y_offset: u32,
	scale: u32,
	data: Vec<f64>,
}

impl Image {
	pub fn new(size:u32, zoom:u32, x_offset:u32, y_offset:u32) -> Image {
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
	pub fn get_pixel_as_point(&self, x:u32, y:u32) -> geometry::Point {
		return geometry::Point::new(
			demercator_x(f64::from(x-self.x_offset)/f64::from(self.scale)),
			demercator_y(f64::from(y-self.y_offset)/f64::from(self.scale)),
		)
	}
}




fn demercator_x(x:f64) -> f64 {
	return x*360.0 - 180.0
}

fn demercator_y(y:f64) -> f64 {
	return (((1.0 - y * 2.0) * PI).exp().atan() * 4.0 / PI - 1.0) * 90.0
}
