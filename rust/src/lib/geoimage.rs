#[path = "geometry.rs"]
mod geometry;

pub mod geoimage {
	use crate::geometry::geometry::Point;
	use image;
	use serde::{Deserialize, Serialize};
	use std::fs::{File,create_dir_all};
	use std::io::{Read, Write};
	use std::panic;
	use std::path::{Path,PathBuf};

	const PI: f64 = std::f64::consts::PI;
	const MAX_DISTANCE: f64 = 3000.0;

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
	pub struct GeoImage {
		pub size: u32,
		zoom: u32,
		x_offset: u32,
		y_offset: u32,
		x0: f64,
		y0: f64,
		pixel_scale: f64,
		data: Vec<f64>,
	}

	impl GeoImage {
		pub fn new(size: u32, zoom: u32, x_offset: u32, y_offset: u32) -> GeoImage {
			let scale = (2.0_f64).powf(zoom as f64);
			//println!("Image::new {} {}", zoom, scale);
			let length: usize = (size * size).try_into().unwrap();
			//println!("size:{} length:{}", size, length);

			let mut image = GeoImage {
				size,
				zoom,
				x_offset,
				y_offset,
				x0: (x_offset as f64) / scale,
				y0: (y_offset as f64) / scale,
				pixel_scale: 1.0 / (size as f64) / scale,
				data: Vec::with_capacity(length),
			};
			image.data.resize(length, MAX_DISTANCE);

			return image;
		}
		pub fn get_pixel_as_point(&self, x: u32, y: u32) -> Point {
			//println!("get_pixel_as_point {} {} {} {} {} {}", x, y, self.x_offset, self.y_offset, self.scale, self.size);

			return Point::new(
				demercator_x((x as f64) * self.pixel_scale + self.x0),
				demercator_y((y as f64) * self.pixel_scale + self.y0),
			);
		}
		pub fn set_pixel_value(&mut self, x: u32, y: u32, distance: f64) {
			if x >= self.size {
				panic!();
			}

			if y >= self.size {
				panic!();
			}

			let index:usize = (x + y * self.size) as usize;
			self.data[index] = distance;
		}
		fn export(&self, filename: &Path) {
			let size = self.size as u32;
			let img = image::ImageBuffer::from_fn(size, size, |x, y| {
				let d = self.data[(x + y * size) as usize];
				let v = d.min(MAX_DISTANCE).max(-MAX_DISTANCE)*1.0 + 32768.0;
				let i = v as u16;
				return image::Rgb([
					(i & 255u16) as u8,
					(i >> 8) as u8,
					0u8
				]);
			});
			let _result = img.save(filename);
		}
		fn export_16(&self, filename: &Path) {
			let size = self.size as u32;
			let img = image::ImageBuffer::from_fn(size, size, |x, y| {
				let d = self.data[(x + y * size) as usize];
				let v = d.min(MAX_DISTANCE).max(-MAX_DISTANCE)*10.0 + 32768.0;
				let i = v as u16;
				return image::Luma([i]);
			});
			let _result = img.save(filename);
		}
		fn save(&self, filename: &Path) {
			let buf: Vec<u8> = bincode::serialize(&self).unwrap();

			let mut file = File::create(filename).unwrap();
			let _result = file.write_all(&buf);
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
			let f2 = (f1 * f1) as f64;

			let mut clone = GeoImage::new(new_size, self.zoom, self.x_offset, self.y_offset);

			for y0 in 0..clone.size {
				for x0 in 0..clone.size {
					let mut sum = 0.0f64;
					for yd in 0..f1 {
						for xd in 0..f1 {
							let index = ((y0 * f1 + yd) * self.size + (x0 * f1 + xd)) as usize;
							sum += self.data[index]
						}
					}
					let index0 = (y0 * clone.size + x0) as usize;
					clone.data[index0] = sum / f2;
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
			
				let tile:&GeoImage = tiles[item.index].as_ref().unwrap();

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
				for y in 0..half_size {
					for x in 0..half_size {
						let i0 = (y * size + x + offset) as usize;
						let i1 = (y * half_size + x) as usize;
						image.data[i0] = image.data[i1];
					}
				}
			}

			return image;
		}
		pub fn export_tile_tree(&self, tile_size: u32, folder: &Path) {
			self.export_tile_layer(tile_size, folder);

			if self.size > tile_size {
				let image = self.scaled_down_clone(self.size/2);
				image.export_tile_tree(tile_size, folder)
			}
		}
		fn export_tile_layer(&self, tile_size: u32, folder: &Path) {
			let n = self.size / tile_size;
			let dz = n.trailing_zeros();

			if tile_size*2u32.pow(dz) != self.size {
				println!("self.size {}, tile_size {}, n {}, dz {}", self.size, tile_size, n, dz);
				panic!()
			}

			for dy in 0..n {
				for dx in 0..n {
					let tile = self.extract_subtile(dx, dy, tile_size);
					tile.export_to(folder);
				}
			}
		}
		pub fn export_to(&self, folder: &Path) {
			self.export(&self.get_path(&folder, ".png").as_path());
		}
		pub fn save_to(&self, folder: &Path) {
			self.save(&self.get_path(&folder, ".bin").as_path());
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
		fn get_path(&self, folder: &Path, extension:&str) -> PathBuf {
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

			for y1 in 0..clone.size {
				for x1 in 0..clone.size {
					let y0 = dy*tile_size + y1;
					let x0 = dx*tile_size + x1;
					let index0 = (y0 *  self.size + x0) as usize;
					let index1 = (y1 * clone.size + x1) as usize;
					clone.data[index1] = self.data[index0];
				}
			}

			return clone;
		}
	}

	fn demercator_x(x: f64) -> f64 {
		return x * 360.0 - 180.0;
	}

	fn demercator_y(y: f64) -> f64 {
		return (((1.0 - y * 2.0) * PI).exp().atan() * 4.0 / PI - 1.0) * 90.0;
	}
}
