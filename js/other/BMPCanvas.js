//(c) 2010 Grant Galitz
//The script acts as a drop-in substitution for the HTML5 canvas tag's putImageData function (Some configuration required ;) ).
//You need from base64.js the functions base64, to_byte, to_little_endian_word, and to_little_endian_dword for this to work.
//It's recommended that you do a try / catch statement, where this script is called in the catch,
//and testing of HTML5 Canvas putImageData is in the try.
//Thank you Wikipedia for the info needed to make this. :D

/*
	Note:
		- Opera limits data URIs to 4 KB.
		- IE 8 limits data URIs to 32 KB.
	This is why there's tiling in the first place!
	In order to not "go over the size limit", you must set a high enough tile count in each direction!
*/

//Create a new BMPCanvas object:
function BMPCanvas(canvas, canvasWidth, canvasHeight, imageX, imageY) {
	/*What's required:
		- A container element that can hold <img> tags.
		- The width of the complete image (The image can be stretched by CSS still!).
		- The height of the complete image (The image can be stretched by CSS still!).
		- The number of tiles horizontally (The width of the complete image must be evenly divisible by this (no remainder)!).
		- The number of tiles vertically (The height of the complete image must be evenly divisible by this (no remainder)!).
		Notes:
			- The number of tiles each direction has to fit into such direction's pixel count,
			since this script can't specially configure the "remainder" tile's width/height.
	*/
	if (canvas.getElementsByTagName("img").length == 0) {
		//Make sure an image tag is present in the container.
		canvas.appendChild(document.createElement("img"));
	}
	this.canvas = canvas.getElementsByTagName("img");	//An array of img DOM elements (Tries to see how many <img> tags are in a container element).
	this.completeWidth = Math.ceil(canvasWidth);		//The width of the full image (Ceil'd to force it as a integer).
	this.completeHeight = Math.ceil(canvasHeight);		//The height of the full image (Ceil'd to force it as a integer).
	this.imageX = (imageX > 0) ? Math.ceil(imageX) : 1;	//How many tiles horizontally (Ceil'd to force it as a integer).
	this.imageY = (imageY > 0) ? Math.ceil(imageY) : 1;	//How many tiles vertically (Ceil'd to force it as a integer).
	this.tileCount = this.imageX * this.imageY;			//Total number of tiles
	this.width = this.completeWidth / this.imageX;		//The computed width of a tile.
	this.height = this.completeHeight / this.imageY;	//The computed height of a tile.
	this.buffersChanged	= [];							//Used to determine whether a redraw is needed.
	this.buffers = [];									//Tile buffer data.
	this.blankTileArray = [];							//Used to reset the tracker array for the buffers.
	this.padAmount = (this.width % 4);					//Used to determine how many padding bytes are needed every tile line.
	if ((this.completeWidth % this.imageX > 0) || (this.completeHeight % this.imageY > 0)) {
		//Vital Parameter Check
		throw(new Error("A dimension must be divisible by the dimension's tile count."));
	}
	if (this.completeWidth < 1 || this.completeHeight < 1) {
		//Dimension Parameter Check
		throw(new Error("A dimension must be a positive integer greater than zero."));
	}
	this.initializeCanvas();
}
//Split up the full image into separate tiles, in order to keep the data URIs below browser-set maximum sizes.
BMPCanvas.prototype.putImageData = function (buffer, x, y) {	//x and y do nothing here (I don't even need them).
	/*Buffer Explaination:
		- The buffer is an array consisting of RGBA values.
		- Each value is a number that's one byte length unsigned.
		- The 'Alpha' is ignored, it's just to provide compatibility with the CanvasPixelArray object.
	*/
	var bufferTracker = this.blankTileArray.slice(0);	//Default all the tile changed flags to false.
	for (var heightSlicer = 0; heightSlicer < this.imageY; heightSlicer++) {
		//Extracting the lines (BMP images are flipped vertically):
		for (var line = ((heightSlicer + 1) * this.height) - 1; line >= heightSlicer * this.height; line--) {
			//Focusing on a block of lines for the current tile buffer (Left to right):
			for (var widthSlicer = 0; widthSlicer < this.imageX; widthSlicer++) {
				//Extracting a line:
				var bufferIndex = (heightSlicer * this.imageX) + widthSlicer;
				for (var column = widthSlicer * this.width; column < (widthSlicer + 1) * this.width; column++) {
					//Extracting a segment of pixels for the current tile buffer:
					for (var pixel = 2; pixel >= 0; pixel--) {
						//Extracting a color (Convert to BGR format from RGBA format):
						var color = to_byte(buffer.data[(4 * ((line * this.completeWidth) + column)) + pixel]);
						this.buffersChanged[bufferIndex] = (this.buffersChanged[bufferIndex] || color != this.buffers[bufferIndex][bufferTracker[bufferIndex]]);
						this.buffers[bufferIndex][bufferTracker[bufferIndex]++] = color;
					}
				}
				bufferTracker[bufferIndex] += this.padAmount;	//Skip past any padding...
			}
		}
	}
	//Create and draw out the BMP formatted images:
	for (var index = 0; index < this.tileCount; index++) {
		//Only redraw a tile when its buffer is different from the last run:
		if (this.buffersChanged[index]) {
			this.bufferUpdate(index);
			this.buffersChanged[index] = false;
		}
	}
}
//Set up the arrays and the tiles:
BMPCanvas.prototype.initializeCanvas = function () {
	this.generatePrefix();	//Create the BMP image prefix/header data.
	while (this.canvas.length < this.tileCount) {
		//Check to see that we have enough image tags to work with:
		this.canvas[0].parentNode.appendChild(document.createElement("img"));
	}
	for (var index = this.tileCount; index < this.canvas.length; index++) {
		this.canvas[0].parentNode.removeChild(this.canvas[index]);
	}
	for (var index = 0; index < this.tileCount; index++) {
		//Setting up the image's attributes (The webpage's CSS is still necessary to layout the image, this just sets up each image's dimensions):
		this.canvas[index].setAttribute("alt", "");
		this.canvas[index].setAttribute("width", this.width + "px");
		this.canvas[index].setAttribute("height", this.height + "px");
		this.canvas[index].style.width = (100 / this.imageX) + "%";
		this.canvas[index].style.height = (100 / this.imageY) + "%";
	}
	var emptyBuffer = [];
	for (var lines = 0; lines < this.height; lines++) {
		for (var columns = 0; columns < this.width; columns++) {
			for (var colors = 0; colors < 3; colors++) {
				emptyBuffer.push(to_byte(0));
			}
		}
		for (var index = 0; index < this.padAmount; index++) {
			//Pad the width to a multiple of four bytes:
			emptyBuffer.push(to_byte(0));
		}
	}
	for (var index = 0; index < this.tileCount; index++) {
		this.buffers[index] = emptyBuffer.slice(0);	//Creating the tile buffers.
		this.buffersChanged[index] = true;			//Set redraw needed state to true, since we haven't drawn yet.
		this.blankTileArray[index] = 0;				//Set the tracker indices to zero.
	}
}
//Compute the BMP image header to be used in all the tiles in every draw:
BMPCanvas.prototype.generatePrefix = function () {
	var headerSize = 54;
	var binarySize = this.height * ((this.width * 3) + this.padAmount) + headerSize;
	var header = [
		"BM",								//Magic Number (66, 77)
		to_little_endian_dword(binarySize),	//Size of the entire binary string
		to_little_endian_dword(0),			//For applications only (Proprietary)
		to_little_endian_dword(headerSize),	//The complete header size
		to_little_endian_dword(40),			//The header size from here
		to_little_endian_dword(this.width),	//width
		to_little_endian_dword(this.height),//height
		to_little_endian_word(1),			//color planes
		to_little_endian_word(24),			//color depth (bits per pixel)
		to_little_endian_dword(0),			//no compression used
		to_little_endian_dword(16),			//header size after here
		to_little_endian_dword(0),			//width resolution
		to_little_endian_dword(0),			//height resolution
		to_little_endian_dword(0),			//colors in the palette
		to_little_endian_dword(0)			//all colors are important
	];
	this.prefix = header.join("");
}
//Convert a tile's data into a BMP image encoded as a data URI:
BMPCanvas.prototype.bufferUpdate = function (bufferIndex) {
	//Encoding and assigning the base64 data to the image:
	this.canvas[bufferIndex].setAttribute("src", "data:image/x-ms-bmp;base64," + base64(this.prefix + this.buffers[bufferIndex].join("")));
}