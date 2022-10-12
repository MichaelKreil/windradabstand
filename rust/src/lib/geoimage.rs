#[path = "geometry.rs"]
mod geometry;

pub mod geoimage {
	use crate::geometry::geometry::{Point, Collection};
	use image;
	use serde::{Deserialize, Serialize};
	use std::fs::{File,create_dir_all};
	use std::io::{Read, Write};
	use std::panic;
	use std::path::{Path,PathBuf};

	const PI: f32 = std::f32::consts::PI;

	pub struct LayoutItem {
		pub index: usize,
		pub x: u32,
		pub y: u32,
	}
	pub const LAYOUT:[LayoutItem;4] = [
		LayoutItem{index:0, x:0, y:0},
		LayoutItem{index:1, x:1, y:0},
		LayoutItem{index:2, x:0, y:1},
		LayoutItem{index:3, x:1, y:1}
	];

	#[derive(Serialize, Deserialize, PartialEq, Debug)]
	pub struct Channel {
		width: u32,
		height: u32,
		data: Vec<f32>,
	}
	impl Channel {
		pub fn new(width: u32, height: u32) -> Channel {
			let length = (width*height) as usize;
			let mut channel = Channel{
				width,
				height,
				data:Vec::with_capacity(length)
			};
			channel.data.resize(length, 1.0e6);
			return channel;
		}
		pub fn set_pixel_value(&mut self, x: u32, y: u32, distance: f32) {
			if x >= self.width {
				panic!();
			}

			if y >= self.height {
				panic!();
			}

			let index:usize = (x + y * self.width) as usize;
			self.data[index] = distance;
		}
	}

	#[derive(Serialize, Deserialize, PartialEq, Debug)]
	pub struct GeoImage {
		pub size: u32,
		zoom: u32,
		x_offset: u32,
		y_offset: u32,
		x0: f32,
		y0: f32,
		pixel_scale: f32,
		channels: Vec<Channel>,
	}

	impl GeoImage {
		pub fn new(size: u32, zoom: u32, x_offset: u32, y_offset: u32) -> GeoImage {
			let scale = (2.0_f32).powf(zoom as f32);
			return GeoImage {
				size,
				zoom,
				x_offset,
				y_offset,
				x0: (x_offset as f32) / scale,
				y0: (y_offset as f32) / scale,
				pixel_scale: 1.0 / (size as f32) / scale,
				channels: Vec::from([
					Channel::new(size, size),
					Channel::new(size, size)
				]),
			};
		}
		pub fn get_pixel_as_point(&self, x: u32, y: u32) -> Point {
			//println!("get_pixel_as_point {} {} {} {} {} {}", x, y, self.x_offset, self.y_offset, self.scale, self.size);

			return Point::new(
				demercator_x((x as f32) * self.pixel_scale + self.x0),
				demercator_y((y as f32) * self.pixel_scale + self.y0),
			);
		}
		fn export(&self, filename: &Path) {
			let extension = filename.extension().unwrap().to_str().unwrap();
			match extension {
				"bin" => {
					let buf: Vec<u8> = bincode::serialize(&self).unwrap();
					let mut file = File::create(filename).unwrap();
					let _result = file.write_all(&buf);
				},
				"png" => {
					let size = self.size as u32;
					let channel0 = &self.channels[0];
					let channel1 = &self.channels[1];
					let img = image::ImageBuffer::from_fn(size, size, |x, y| {
						let index = (x + y * size) as usize;
						let v0 = channel0.data[index].max(0.0).min(1.0);
						let v1 = channel1.data[index].max(0.0).min(1.0);
						return image::Rgb([
							(v0*255.0) as u8,
							(v1*255.0) as u8,
							0u8,
						]);
					});
					let _result = img.save(filename);
				},
				_ => {
					println!("unknown extension: {}", extension);
					panic!();
				}
			}
		}
		pub fn load(filename: &Path) -> GeoImage {
			let mut buffer: Vec<u8> = Vec::new();
			let mut file = File::open(filename).unwrap();
			let _result = file.read_to_end(&mut buffer);
			let image: GeoImage = bincode::deserialize(&buffer).unwrap();
			return image;
		}
		pub fn scaled_down_clone(&self, new_size: u32) -> GeoImage {
			if new_size >= self.size {
				panic!()
			}

			let f1 = self.size / new_size;
			let f2 = (f1 * f1) as f32;

			let mut clone = GeoImage::new(new_size, self.zoom, self.x_offset, self.y_offset);

			let channel_count = self.channels.len();

			for i in 0..channel_count {
				let channel0 = &self.channels[i];
				let channel1 = &mut clone.channels[i];
				let clone_size = clone.size;

				for y0 in 0..clone_size {
					for x0 in 0..clone_size {
						let mut sum = 0.0f32;
						for yd in 0..f1 {
							for xd in 0..f1 {
								let index = ((y0 * f1 + yd) * self.size + (x0 * f1 + xd)) as usize;
								sum += channel0.data[index]
							}
						}
						let index0 = (y0 * clone_size + x0) as usize;
						channel1.data[index0] = sum / f2;
					}
				}
			}

			return clone;
		}
		pub fn merge(tiles: [Option<GeoImage>;4], size:u32, zoom:u32, x_offset:u32, y_offset:u32) -> GeoImage {
			if tiles.len() != 4 {
				panic!("need 4")
			};
			
			let half_size = size/2;
			let mut image = GeoImage::new(size, zoom, x_offset, y_offset);

			for item in LAYOUT {
				if tiles[item.index].is_none() {
					continue;
				}
			
				let tile: &GeoImage = tiles[item.index].as_ref().unwrap();

				if tile.size != half_size {
					panic!("wrong size")
				};
				if tile.zoom != zoom + 1 {
					panic!("wrong zoom")
				};
				if tile.x_offset != x_offset * 2 + item.x {
					panic!("wrong x_offset")
				};
				if tile.y_offset != y_offset * 2 + item.y {
					panic!("wrong y_offset")
				};
				
				let offset = item.x * half_size + item.y * half_size * size;
				
				for i in 0..tile.channels.len() {
					let channel0 = &tile.channels[i];
					let channel1 = &mut image.channels[i];

					for y in 0..half_size {
						for x in 0..half_size {
							let i0 = (y * size + x + offset) as usize;
							let i1 = (y * half_size + x) as usize;
							channel1.data[i0] = channel0.data[i1];
						}
					}
				}
			}

			return image;
		}
		pub fn export_tile_tree(&self, tile_size: u32, folder: &Path, extension: &str) {
			self.export_tile_layer(tile_size, folder, extension);

			if self.size > tile_size {
				let image = self.scaled_down_clone(self.size/2);
				image.export_tile_tree(tile_size, folder, extension)
			}
		}
		fn export_tile_layer(&self, tile_size: u32, folder: &Path, extension: &str) {
			let n = self.size / tile_size;
			let dz = n.trailing_zeros();

			if tile_size*2u32.pow(dz) != self.size {
				println!("self.size {}, tile_size {}, n {}, dz {}", self.size, tile_size, n, dz);
				panic!()
			}

			for dy in 0..n {
				for dx in 0..n {
					let tile = self.extract_subtile(dx, dy, tile_size);
					tile.export_to(folder, extension);
				}
			}
		}
		pub fn export_to(&self, folder: &Path, extension: &str) {
			self.export(&self.get_path(&folder, extension).as_path());
		}
		pub fn calc_path(folder: &Path, z: u32, y: u32, x: u32, extension: &str) -> PathBuf {
			let mut filename = PathBuf::from(folder);

			filename.push(z.to_string());
			filename.push(y.to_string());

			if create_dir_all(filename.as_path()).is_err() {
				panic!();
			}

			filename.push(x.to_string() + extension);

			return filename;
		}
		fn get_path(&self, folder: &Path, extension: &str) -> PathBuf {
			return GeoImage::calc_path(folder, self.zoom, self.y_offset, self.x_offset, extension);
		}
		fn extract_subtile(&self, dx: u32, dy: u32, tile_size: u32) -> GeoImage {
			let n = self.size / tile_size;
			let dz = n.trailing_zeros();

			if tile_size*2u32.pow(dz) != self.size {
				panic!()
			}

			let mut clone = GeoImage::new(
				tile_size,
				self.zoom + dz,
				self.x_offset*n + dx,
				self.y_offset*n + dy
			);

			for i in 0..self.channels.len() {
				let channel0 = &self.channels[i];
				let channel1 = &mut clone.channels[i];

				for y1 in 0..clone.size {
					for x1 in 0..clone.size {
						let y0 = dy*tile_size + y1;
						let x0 = dx*tile_size + x1;
						let index0 = (y0 *  self.size + x0) as usize;
						let index1 = (y1 * clone.size + x1) as usize;
						channel1.data[index1] = channel0.data[index0];
					}
				}
			}

			return clone;
		}
		pub fn fill_with_min_distances(&mut self, channel_index:usize, collection:Collection, min_distance:f32, max_distance:f32) {
			let channel = &mut self.channels[channel_index];
			for y in 0..channel.height {
				for x in 0..channel.width {
					let point = Point::new(
						demercator_x((x as f32) * self.pixel_scale + self.x0),
						demercator_y((y as f32) * self.pixel_scale + self.y0),
					);
					let distance = collection.get_min_distance(point, max_distance);
					channel.set_pixel_value(x, y, (distance-min_distance)/(max_distance-min_distance));
				}
			}
		}
	}

	fn demercator_x(x: f32) -> f32 {
		return x * 360.0 - 180.0;
	}

	fn demercator_y(y: f32) -> f32 {
		return (((1.0 - y * 2.0) * PI).exp().atan() * 4.0 / PI - 1.0) * 90.0;
	}
}
