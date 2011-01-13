/* 
 * JavaScript GameBoy Color Emulator
 * Copyright (C) 2010 Grant Galitz
 * 
 * Ported the video engine (advanced gfx one), some HDMA handling, and the double speed mode procedure (STOP opcode procedure) from MeBoy 2.2
 * http://arktos.se/meboy/
 * Copyright (C) 2005-2009 Bjorn Carlin
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * version 2 as published by the Free Software Foundation.
 * The full license is available at http://www.gnu.org/licenses/gpl.html
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 */
 /**
 *TODO:
	- Working On Right Now:
		- Add a way where the sprite count on a line changes the STAT number adjustment for current clock cycle.
		- Make I/O bit reading and writing more accurate.
	- Started already, but far from merging into here:
		- Serial port link for multiplayer type stuff
		- IR port
		- GBA (ARM7TDMI CPU Core) support will be coming when I feel like working on it more.
			- Could be split off into a separate project, because the CPU is completely different.
	- Afterwards....
		- Fix some boogs.
		- A Bit Later... Byte Later... Which ever comes first :P
			- Add some more MBC support (I haven't seen any game except one so far that uses an unsupported MBC)
				- MBC7, TAMA5, HuC1, etc.
 **/
function GameBoyCore(canvas, canvasAlt, ROMImage) {
	this.canvas = canvas;						//Canvas DOM object for drawing out the graphics to.
	this.canvasAlt = canvasAlt;					//Image DOM object for drawing out the graphics to as an alternate means.
	this.canvasFallbackHappened = false;		//Used for external scripts to tell if we're really using the canvas or not (Helpful with fullscreen switching).
	this.drawContext = null;					// LCD Context
	this.ROMImage = ROMImage;					//The game's ROM. 
	this.ROM = [];								//The full ROM file dumped to an array.
	this.inBootstrap = true;					//Whether we're in the GBC boot ROM.
	this.usedBootROM = false;					//Updated upon ROM loading...
	this.registerA = 0x01; 						// Accumulator (default is GB mode)
	this.FZero = true; 							// bit 7 - Zero
	this.FSubtract = false;						// bit 6 - Sub
	this.FHalfCarry = true;						// bit 5 - Half Carry
	this.FCarry = true;							// bit 4 - Carry
	this.registerB = 0x00;						// Register B
	this.registerC = 0x13;						// Register C
	this.registerD = 0x00;						// Register D
	this.registerE = 0xD8;						// Register E
	this.registersHL = 0x014D;					// Registers H and L
	this.memoryReader = [];						//Array of functions mapped to read back memory
	this.memoryWriter = [];						//Array of functions mapped to write to memory
	this.stackPointer = 0xFFFE;					// Stack Pointer
	this.programCounter = 0x0100;				// Program Counter
	this.halt = false;							//Has the CPU been suspended until the next interrupt?
	this.skipPCIncrement = false;				//Did we trip the DMG Halt bug?
	this.stopEmulator = 3;						//Has the emulation been paused or a frame has ended?
	this.IME = true;							//Are interrupts enabled?
	this.hdmaRunning = false;					//HDMA Transfer Flag - GBC only
	this.CPUTicks = 0;							//The number of clock cycles emulated.
	this.multiplier = 1;						//GBC Speed Multiplier
	//Main RAM, MBC RAM, GBC Main RAM, VRAM, etc.
	this.memory = [];							//Main Core Memory
	this.MBCRam = [];							//Switchable RAM (Used by games for more RAM) for the main memory range 0xA000 - 0xC000.
	this.VRAM = [];								//Extra VRAM bank for GBC.
	this.currVRAMBank = 0;						//Current VRAM bank for GBC.
	this.GBCMemory = [];						//GBC main RAM Banks
	this.MBC1Mode = false;						//MBC1 Type (4/32, 16/8)
	this.MBCRAMBanksEnabled = false;			//MBC RAM Access Control.
	this.currMBCRAMBank = 0;					//MBC Currently Indexed RAM Bank
	this.currMBCRAMBankPosition = -0xA000;		//MBC Position Adder;
	this.cGBC = false;							//GameBoy Color detection.
	this.gbcRamBank = 1;						//Currently Switched GameBoy Color ram bank
	this.gbcRamBankPosition = -0xD000;			//GBC RAM offset from address start.
	this.gbcRamBankPositionECHO = -0xF000;		//GBC RAM (ECHO mirroring) offset from address start.
	this.RAMBanks = [0, 1, 2, 4, 16];			//Used to map the RAM banks to maximum size the MBC used can do.
	this.ROMBank1offs = 0;						//Offset of the ROM bank switching.
	this.currentROMBank = 0;					//The parsed current ROM bank selection.
	this.cartridgeType = 0;						//Cartridge Type
	this.name = "";								//Name of the game
	this.gameCode = "";							//Game code (Suffix for older games)
	this.fromSaveState = false;					//A boolean to see if this was loaded in as a save state.
	this.savedStateFileName = "";				//When loaded in as a save state, this will not be empty.
	this.STATTracker = 0;						//Tracker for STAT triggering.
	this.modeSTAT = 0;							//The scan line mode (for lines 1-144 it's 2-3-0, for 145-154 it's 1)
	this.LYCMatchTriggerSTAT = false;			//Should we trigger an interrupt if LY==LYC?
	this.mode2TriggerSTAT = false;				//Should we trigger an interrupt if in mode 2?
	this.mode1TriggerSTAT = false;				//Should we trigger an interrupt if in mode 1?
	this.mode0TriggerSTAT = false;				//Should we trigger an interrupt if in mode 0?
	this.LCDisOn = false;						//Is the emulated LCD controller on?
	this.LINECONTROL = new Array(154);			//Array of functions to handle each scan line we do (onscreen + offscreen)
	this.DISPLAYOFFCONTROL = new Array(function (parentObj) {
		//Array of line 0 function to handle the LCD controller when it's off (Do nothing!).
	});
	this.LCDCONTROL = null;						//Pointer to either LINECONTROL or DISPLAYOFFCONTROL.
	this.gfxWindowY = false;
	this.gfxWindowDisplay = false;
	this.gfxSpriteShow = false;
	this.gfxSpriteDouble = false;
	this.gfxBackgroundY = false;
	this.gfxBackgroundX = false;
	this.TIMAEnabled = false;
	this.JoyPad = 0xFF;							//Joypad State (two four-bit states actually)
	//RTC:
	this.RTCisLatched = true;
	this.latchedSeconds = 0;
	this.latchedMinutes = 0;
	this.latchedHours = 0;
	this.latchedLDays = 0;
	this.latchedHDays = 0;
	this.RTCSeconds = 0;
	this.RTCMinutes = 0;
	this.RTCHours = 0;
	this.RTCDays = 0;
	this.RTCDayOverFlow = false;
	this.RTCHALT = false;
	//Sound variables:
	this.audioHandle = null;					//Audio object or the WAV PCM generator wrapper
	this.outTracker = 0;						//Buffering counter for the WAVE PCM output.
	this.outTrackerLimit = 0;					//Buffering limiter for WAVE PCM output.
	this.numSamplesTotal = 0;					//Length of the sound buffers.
	this.sampleSize = 0;						//Length of the sound buffer for one channel.
	this.dutyLookup = [0.125, 0.25, 0.5, 0.75];	//Map the duty values given to ones we can work with.
	this.audioSamples = [];						//The audio buffer we're working on (When not overflowing).
	this.audioBackup = [];						//Audio overflow buffer.
	this.usingBackupAsMain = 0;					//Don't copy over the backup buffer to the main buffer on the next iteration, instead make the backup the main buffer (vice versa).
	this.currentBuffer = this.audioSamples;		//Pointer to the sample workbench.
	this.channelLeftCount = 0;					//How many channels are being fed into the left side stereo / mono.
	this.channelRightCount = 0;					//How many channels are being fed into the right side stereo.
	this.initializeAudioStartState();
	this.noiseTableLookup = null;
	this.smallNoiseTable = new Array(0x80);
	this.largeNoiseTable = new Array(0x8000);
	this.soundMasterEnabled = false;			//As its name implies
	this.audioType = -1;						//Track what method we're using for audio output.
	//Vin Shit:
	this.VinLeftChannelEnabled = false;
	this.VinRightChannelEnabled = false;
	this.VinLeftChannelMasterVolume = 0;
	this.VinRightChannelMasterVolume = 0;
	this.vinLeft = 1;
	this.vinRight = 1;
	//Channels Enabled:
	this.leftChannel = this.ArrayPad(4, false);		//Which channels are enabled for left side stereo / mono?
	this.rightChannel = this.ArrayPad(4, false);	//Which channels are enabled for right side stereo?
	//Current Samples Being Computed:
	this.currentSampleLeft = 0;
	this.currentSampleRight = 0;
	this.channel3Tracker = 0;
	//Pre-multipliers to cache some calculations:
	this.preChewedAudioComputationMultiplier = 0x20000 / settings[14];
	this.preChewedWAVEAudioComputationMultiplier = 0x200000 / settings[14];
	this.whiteNoiseFrequencyPreMultiplier = 4194300 / settings[14] / 8;
	this.samplesOut = 0;				//Premultiplier for audio samples per instructions.
	this.volumeEnvelopePreMultiplier = settings[14] / 0x40;
	this.channel1TimeSweepPreMultiplier = settings[14] / 0x80;
	this.audioTotalLengthMultiplier = settings[14] / 0x100;
	//Audio generation counters:
	this.audioOverflow = false;
	this.audioTicks = 0;				//Used to sample the audio system every x CPU instructions.
	this.audioIndex = 0;				//Used to keep alignment on audio generation.
	this.rollover = 0;					//Used to keep alignment on the number of samples to output (Realign from counter alias).
	//Timing Variables
	this.emulatorTicks = 0;				//Times for how many instructions to execute before ending the loop.
	this.DIVTicks = 14;					// DIV Ticks Counter (Invisible lower 8-bit)
	this.LCDTicks = 15;					// ScanLine Counter
	this.timerTicks = 0;				// Timer Ticks Count
	this.TACClocker = 256;			// Timer Max Ticks
	this.untilEnable = 0;				//Are the interrupts on queue to be enabled?
	this.lastIteration = 0;				//The last time we iterated the main loop.
	this.actualScanLine = 0;			//Actual scan line...
	//ROM Cartridge Components:
	this.cMBC1 = false;					//Does the cartridge use MBC1?
	this.cMBC2 = false;					//Does the cartridge use MBC2?
	this.cMBC3 = false;					//Does the cartridge use MBC3?
	this.cMBC5 = false;					//Does the cartridge use MBC5?
	this.cSRAM = false;					//Does the cartridge use save RAM?
	this.cMMMO1 = false;				//...
	this.cRUMBLE = false;				//Does the cartridge use the RUMBLE addressing (modified MBC5)?
	this.cCamera = false;				//...
	this.cTAMA5 = false;				//...
	this.cHuC3 = false;					//...
	this.cHuC1 = false;					//Does the cartridge use HuC1 (modified MBC1)?
	this.ROMBanks = [					// 1 Bank = 16 KBytes = 256 Kbits
		2, 4, 8, 16, 32, 64, 128, 256, 512
	];
	this.ROMBanks[0x52] = 72;
	this.ROMBanks[0x53] = 80;
	this.ROMBanks[0x54] = 96;
	this.numRAMBanks = 0;				//How many RAM banks were actually allocated?
	//Graphics Variables
	this.drewBlank = 0;					//To prevent the repeating of drawing a blank screen.
	this.tileData = [];					// tile data arrays
	this.frameBuffer = [];
	this.scaledFrameBuffer = [];
	this.canvasBuffer;
	this.gbcRawPalette = [];
	this.tileCount = 384;				//GB: 384, GBC: 384 * 2
	this.tileCountInvalidator = this.tileCount * 4;
	this.colorCount = 12;
	this.gbPalette = [];
	this.gbColorizedPalette = [];
	this.gbcPalette = [];
	this.transparentCutoff = 4;			// min "attrib" value where transparency can occur (Default is 4 (GB mode))
	this.bgEnabled = true;
	this.spritePriorityEnabled = true;
	this.tileReadState = [];			// true if there are any images to be invalidated
	this.windowSourceLine = 0;
	this.colors = new Array(0x80EFFFDE, 0x80ADD794, 0x80529273, 0x80183442);	//"Classic" GameBoy palette colors.
	this.frameCount = settings[12];		//Frame skip tracker
	this.weaveLookup = [];
	this.width = 160;
	this.height = 144;
	this.pixelCount = this.width * this.height;
	this.rgbCount = this.pixelCount * 4;
	this.widthRatio = 160 / this.width;
	this.heightRatio = 144 / this.height;
	this.palette = null;				//Pointer to the current palette we're using (Used for palette switches during boot or so it can be done anytime)
}
GameBoyCore.prototype.DAATable = new Array(			// DAA lookup array from VBA-M (I need to make an algo to generate this on startup instead. <_< )
	0x0080, 0x0100, 0x0200, 0x0300, 0x0400, 0x0500, 0x0600, 0x0700,			0x0800, 0x0900, 0x1000, 0x1100, 0x1200, 0x1300, 0x1400, 0x1500,
	0x1000, 0x1100, 0x1200, 0x1300, 0x1400, 0x1500, 0x1600, 0x1700,			0x1800, 0x1900, 0x2000, 0x2100, 0x2200, 0x2300, 0x2400, 0x2500,
	0x2000, 0x2100, 0x2200, 0x2300, 0x2400, 0x2500, 0x2600, 0x2700,			0x2800, 0x2900, 0x3000, 0x3100, 0x3200, 0x3300, 0x3400, 0x3500,
	0x3000, 0x3100, 0x3200, 0x3300, 0x3400, 0x3500, 0x3600, 0x3700,			0x3800, 0x3900, 0x4000, 0x4100, 0x4200, 0x4300, 0x4400, 0x4500,
	0x4000, 0x4100, 0x4200, 0x4300, 0x4400, 0x4500, 0x4600, 0x4700,			0x4800, 0x4900, 0x5000, 0x5100, 0x5200, 0x5300, 0x5400, 0x5500,
	0x5000, 0x5100, 0x5200, 0x5300, 0x5400, 0x5500, 0x5600, 0x5700,			0x5800, 0x5900, 0x6000, 0x6100, 0x6200, 0x6300, 0x6400, 0x6500,
	0x6000, 0x6100, 0x6200, 0x6300, 0x6400, 0x6500, 0x6600, 0x6700,			0x6800, 0x6900, 0x7000, 0x7100, 0x7200, 0x7300, 0x7400, 0x7500,
	0x7000, 0x7100, 0x7200, 0x7300, 0x7400, 0x7500, 0x7600, 0x7700,			0x7800, 0x7900, 0x8000, 0x8100, 0x8200, 0x8300, 0x8400, 0x8500,
	0x8000, 0x8100, 0x8200, 0x8300, 0x8400, 0x8500, 0x8600, 0x8700,			0x8800, 0x8900, 0x9000, 0x9100, 0x9200, 0x9300, 0x9400, 0x9500,
	0x9000, 0x9100, 0x9200, 0x9300, 0x9400, 0x9500, 0x9600, 0x9700,			0x9800, 0x9900, 0x0090, 0x0110, 0x0210, 0x0310, 0x0410, 0x0510,
	0x0090, 0x0110, 0x0210, 0x0310, 0x0410, 0x0510, 0x0610, 0x0710,			0x0810, 0x0910, 0x1010, 0x1110, 0x1210, 0x1310, 0x1410, 0x1510,
	0x1010, 0x1110, 0x1210, 0x1310, 0x1410, 0x1510, 0x1610, 0x1710,			0x1810, 0x1910, 0x2010, 0x2110, 0x2210, 0x2310, 0x2410, 0x2510,
	0x2010, 0x2110, 0x2210, 0x2310, 0x2410, 0x2510, 0x2610, 0x2710,			0x2810, 0x2910, 0x3010, 0x3110, 0x3210, 0x3310, 0x3410, 0x3510,
	0x3010, 0x3110, 0x3210, 0x3310, 0x3410, 0x3510, 0x3610, 0x3710,			0x3810, 0x3910, 0x4010, 0x4110, 0x4210, 0x4310, 0x4410, 0x4510,
	0x4010, 0x4110, 0x4210, 0x4310, 0x4410, 0x4510, 0x4610, 0x4710,			0x4810, 0x4910, 0x5010, 0x5110, 0x5210, 0x5310, 0x5410, 0x5510,
	0x5010, 0x5110, 0x5210, 0x5310, 0x5410, 0x5510, 0x5610, 0x5710,			0x5810, 0x5910, 0x6010, 0x6110, 0x6210, 0x6310, 0x6410, 0x6510,
	0x6010, 0x6110, 0x6210, 0x6310, 0x6410, 0x6510, 0x6610, 0x6710,			0x6810, 0x6910, 0x7010, 0x7110, 0x7210, 0x7310, 0x7410, 0x7510,
	0x7010, 0x7110, 0x7210, 0x7310, 0x7410, 0x7510, 0x7610, 0x7710,			0x7810, 0x7910, 0x8010, 0x8110, 0x8210, 0x8310, 0x8410, 0x8510,
	0x8010, 0x8110, 0x8210, 0x8310, 0x8410, 0x8510, 0x8610, 0x8710,			0x8810, 0x8910, 0x9010, 0x9110, 0x9210, 0x9310, 0x9410, 0x9510,
	0x9010, 0x9110, 0x9210, 0x9310, 0x9410, 0x9510, 0x9610, 0x9710,			0x9810, 0x9910, 0xA010, 0xA110, 0xA210, 0xA310, 0xA410, 0xA510,
	0xA010, 0xA110, 0xA210, 0xA310, 0xA410, 0xA510, 0xA610, 0xA710,			0xA810, 0xA910, 0xB010, 0xB110, 0xB210, 0xB310, 0xB410, 0xB510,
	0xB010, 0xB110, 0xB210, 0xB310, 0xB410, 0xB510, 0xB610, 0xB710,			0xB810, 0xB910, 0xC010, 0xC110, 0xC210, 0xC310, 0xC410, 0xC510,
	0xC010, 0xC110, 0xC210, 0xC310, 0xC410, 0xC510, 0xC610, 0xC710,			0xC810, 0xC910, 0xD010, 0xD110, 0xD210, 0xD310, 0xD410, 0xD510,
	0xD010, 0xD110, 0xD210, 0xD310, 0xD410, 0xD510, 0xD610, 0xD710,			0xD810, 0xD910, 0xE010, 0xE110, 0xE210, 0xE310, 0xE410, 0xE510,
	0xE010, 0xE110, 0xE210, 0xE310, 0xE410, 0xE510, 0xE610, 0xE710,			0xE810, 0xE910, 0xF010, 0xF110, 0xF210, 0xF310, 0xF410, 0xF510,
	0xF010, 0xF110, 0xF210, 0xF310, 0xF410, 0xF510, 0xF610, 0xF710,			0xF810, 0xF910, 0x0090, 0x0110, 0x0210, 0x0310, 0x0410, 0x0510,
	0x0090, 0x0110, 0x0210, 0x0310, 0x0410, 0x0510, 0x0610, 0x0710,			0x0810, 0x0910, 0x1010, 0x1110, 0x1210, 0x1310, 0x1410, 0x1510,
	0x1010, 0x1110, 0x1210, 0x1310, 0x1410, 0x1510, 0x1610, 0x1710,			0x1810, 0x1910, 0x2010, 0x2110, 0x2210, 0x2310, 0x2410, 0x2510,
	0x2010, 0x2110, 0x2210, 0x2310, 0x2410, 0x2510, 0x2610, 0x2710,			0x2810, 0x2910, 0x3010, 0x3110, 0x3210, 0x3310, 0x3410, 0x3510,
	0x3010, 0x3110, 0x3210, 0x3310, 0x3410, 0x3510, 0x3610, 0x3710,			0x3810, 0x3910, 0x4010, 0x4110, 0x4210, 0x4310, 0x4410, 0x4510,
	0x4010, 0x4110, 0x4210, 0x4310, 0x4410, 0x4510, 0x4610, 0x4710,			0x4810, 0x4910, 0x5010, 0x5110, 0x5210, 0x5310, 0x5410, 0x5510,
	0x5010, 0x5110, 0x5210, 0x5310, 0x5410, 0x5510, 0x5610, 0x5710,			0x5810, 0x5910, 0x6010, 0x6110, 0x6210, 0x6310, 0x6410, 0x6510,
	0x0600, 0x0700, 0x0800, 0x0900, 0x0A00, 0x0B00, 0x0C00, 0x0D00,			0x0E00, 0x0F00, 0x1000, 0x1100, 0x1200, 0x1300, 0x1400, 0x1500,
	0x1600, 0x1700, 0x1800, 0x1900, 0x1A00, 0x1B00, 0x1C00, 0x1D00,			0x1E00, 0x1F00, 0x2000, 0x2100, 0x2200, 0x2300, 0x2400, 0x2500,
	0x2600, 0x2700, 0x2800, 0x2900, 0x2A00, 0x2B00, 0x2C00, 0x2D00,			0x2E00, 0x2F00, 0x3000, 0x3100, 0x3200, 0x3300, 0x3400, 0x3500,
	0x3600, 0x3700, 0x3800, 0x3900, 0x3A00, 0x3B00, 0x3C00, 0x3D00,			0x3E00, 0x3F00, 0x4000, 0x4100, 0x4200, 0x4300, 0x4400, 0x4500,
	0x4600, 0x4700, 0x4800, 0x4900, 0x4A00, 0x4B00, 0x4C00, 0x4D00,			0x4E00, 0x4F00, 0x5000, 0x5100, 0x5200, 0x5300, 0x5400, 0x5500,
	0x5600, 0x5700, 0x5800, 0x5900, 0x5A00, 0x5B00, 0x5C00, 0x5D00,			0x5E00, 0x5F00, 0x6000, 0x6100, 0x6200, 0x6300, 0x6400, 0x6500,
	0x6600, 0x6700, 0x6800, 0x6900, 0x6A00, 0x6B00, 0x6C00, 0x6D00,			0x6E00, 0x6F00, 0x7000, 0x7100, 0x7200, 0x7300, 0x7400, 0x7500,
	0x7600, 0x7700, 0x7800, 0x7900, 0x7A00, 0x7B00, 0x7C00, 0x7D00,			0x7E00, 0x7F00, 0x8000, 0x8100, 0x8200, 0x8300, 0x8400, 0x8500,
	0x8600, 0x8700, 0x8800, 0x8900, 0x8A00, 0x8B00, 0x8C00, 0x8D00,			0x8E00, 0x8F00, 0x9000, 0x9100, 0x9200, 0x9300, 0x9400, 0x9500,
	0x9600, 0x9700, 0x9800, 0x9900, 0x9A00, 0x9B00, 0x9C00, 0x9D00,			0x9E00, 0x9F00, 0x0090, 0x0110, 0x0210, 0x0310, 0x0410, 0x0510,
	0x0610, 0x0710, 0x0810, 0x0910, 0x0A10, 0x0B10, 0x0C10, 0x0D10,			0x0E10, 0x0F10, 0x1010, 0x1110, 0x1210, 0x1310, 0x1410, 0x1510,
	0x1610, 0x1710, 0x1810, 0x1910, 0x1A10, 0x1B10, 0x1C10, 0x1D10,			0x1E10, 0x1F10, 0x2010, 0x2110, 0x2210, 0x2310, 0x2410, 0x2510,
	0x2610, 0x2710, 0x2810, 0x2910, 0x2A10, 0x2B10, 0x2C10, 0x2D10,			0x2E10, 0x2F10, 0x3010, 0x3110, 0x3210, 0x3310, 0x3410, 0x3510,
	0x3610, 0x3710, 0x3810, 0x3910, 0x3A10, 0x3B10, 0x3C10, 0x3D10,			0x3E10, 0x3F10, 0x4010, 0x4110, 0x4210, 0x4310, 0x4410, 0x4510,
	0x4610, 0x4710, 0x4810, 0x4910, 0x4A10, 0x4B10, 0x4C10, 0x4D10,			0x4E10, 0x4F10, 0x5010, 0x5110, 0x5210, 0x5310, 0x5410, 0x5510,
	0x5610, 0x5710, 0x5810, 0x5910, 0x5A10, 0x5B10, 0x5C10, 0x5D10,			0x5E10, 0x5F10, 0x6010, 0x6110, 0x6210, 0x6310, 0x6410, 0x6510,
	0x6610, 0x6710, 0x6810, 0x6910, 0x6A10, 0x6B10, 0x6C10, 0x6D10,			0x6E10, 0x6F10, 0x7010, 0x7110, 0x7210, 0x7310, 0x7410, 0x7510,
	0x7610, 0x7710, 0x7810, 0x7910, 0x7A10, 0x7B10, 0x7C10, 0x7D10,			0x7E10, 0x7F10, 0x8010, 0x8110, 0x8210, 0x8310, 0x8410, 0x8510,
	0x8610, 0x8710, 0x8810, 0x8910, 0x8A10, 0x8B10, 0x8C10, 0x8D10,			0x8E10, 0x8F10, 0x9010, 0x9110, 0x9210, 0x9310, 0x9410, 0x9510,
	0x9610, 0x9710, 0x9810, 0x9910, 0x9A10, 0x9B10, 0x9C10, 0x9D10,			0x9E10, 0x9F10, 0xA010, 0xA110, 0xA210, 0xA310, 0xA410, 0xA510,
	0xA610, 0xA710, 0xA810, 0xA910, 0xAA10, 0xAB10, 0xAC10, 0xAD10,			0xAE10, 0xAF10, 0xB010, 0xB110, 0xB210, 0xB310, 0xB410, 0xB510,
	0xB610, 0xB710, 0xB810, 0xB910, 0xBA10, 0xBB10, 0xBC10, 0xBD10,			0xBE10, 0xBF10, 0xC010, 0xC110, 0xC210, 0xC310, 0xC410, 0xC510,
	0xC610, 0xC710, 0xC810, 0xC910, 0xCA10, 0xCB10, 0xCC10, 0xCD10,			0xCE10, 0xCF10, 0xD010, 0xD110, 0xD210, 0xD310, 0xD410, 0xD510,
	0xD610, 0xD710, 0xD810, 0xD910, 0xDA10, 0xDB10, 0xDC10, 0xDD10,			0xDE10, 0xDF10, 0xE010, 0xE110, 0xE210, 0xE310, 0xE410, 0xE510,
	0xE610, 0xE710, 0xE810, 0xE910, 0xEA10, 0xEB10, 0xEC10, 0xED10,			0xEE10, 0xEF10, 0xF010, 0xF110, 0xF210, 0xF310, 0xF410, 0xF510,
	0xF610, 0xF710, 0xF810, 0xF910, 0xFA10, 0xFB10, 0xFC10, 0xFD10,			0xFE10, 0xFF10, 0x0090, 0x0110, 0x0210, 0x0310, 0x0410, 0x0510,
	0x0610, 0x0710, 0x0810, 0x0910, 0x0A10, 0x0B10, 0x0C10, 0x0D10,			0x0E10, 0x0F10, 0x1010, 0x1110, 0x1210, 0x1310, 0x1410, 0x1510,
	0x1610, 0x1710, 0x1810, 0x1910, 0x1A10, 0x1B10, 0x1C10, 0x1D10,			0x1E10, 0x1F10, 0x2010, 0x2110, 0x2210, 0x2310, 0x2410, 0x2510,
	0x2610, 0x2710, 0x2810, 0x2910, 0x2A10, 0x2B10, 0x2C10, 0x2D10,			0x2E10, 0x2F10, 0x3010, 0x3110, 0x3210, 0x3310, 0x3410, 0x3510,
	0x3610, 0x3710, 0x3810, 0x3910, 0x3A10, 0x3B10, 0x3C10, 0x3D10,			0x3E10, 0x3F10, 0x4010, 0x4110, 0x4210, 0x4310, 0x4410, 0x4510,
	0x4610, 0x4710, 0x4810, 0x4910, 0x4A10, 0x4B10, 0x4C10, 0x4D10,			0x4E10, 0x4F10, 0x5010, 0x5110, 0x5210, 0x5310, 0x5410, 0x5510,
	0x5610, 0x5710, 0x5810, 0x5910, 0x5A10, 0x5B10, 0x5C10, 0x5D10,			0x5E10, 0x5F10, 0x6010, 0x6110, 0x6210, 0x6310, 0x6410, 0x6510,
	0x00C0, 0x0140, 0x0240, 0x0340, 0x0440, 0x0540, 0x0640, 0x0740,			0x0840, 0x0940, 0x0A40, 0x0B40, 0x0C40, 0x0D40, 0x0E40, 0x0F40,
	0x1040, 0x1140, 0x1240, 0x1340, 0x1440, 0x1540, 0x1640, 0x1740,			0x1840, 0x1940, 0x1A40, 0x1B40, 0x1C40, 0x1D40, 0x1E40, 0x1F40,
	0x2040, 0x2140, 0x2240, 0x2340, 0x2440, 0x2540, 0x2640, 0x2740,			0x2840, 0x2940, 0x2A40, 0x2B40, 0x2C40, 0x2D40, 0x2E40, 0x2F40,
	0x3040, 0x3140, 0x3240, 0x3340, 0x3440, 0x3540, 0x3640, 0x3740,			0x3840, 0x3940, 0x3A40, 0x3B40, 0x3C40, 0x3D40, 0x3E40, 0x3F40,
	0x4040, 0x4140, 0x4240, 0x4340, 0x4440, 0x4540, 0x4640, 0x4740,			0x4840, 0x4940, 0x4A40, 0x4B40, 0x4C40, 0x4D40, 0x4E40, 0x4F40,
	0x5040, 0x5140, 0x5240, 0x5340, 0x5440, 0x5540, 0x5640, 0x5740,			0x5840, 0x5940, 0x5A40, 0x5B40, 0x5C40, 0x5D40, 0x5E40, 0x5F40,
	0x6040, 0x6140, 0x6240, 0x6340, 0x6440, 0x6540, 0x6640, 0x6740,			0x6840, 0x6940, 0x6A40, 0x6B40, 0x6C40, 0x6D40, 0x6E40, 0x6F40,
	0x7040, 0x7140, 0x7240, 0x7340, 0x7440, 0x7540, 0x7640, 0x7740,			0x7840, 0x7940, 0x7A40, 0x7B40, 0x7C40, 0x7D40, 0x7E40, 0x7F40,
	0x8040, 0x8140, 0x8240, 0x8340, 0x8440, 0x8540, 0x8640, 0x8740,			0x8840, 0x8940, 0x8A40, 0x8B40, 0x8C40, 0x8D40, 0x8E40, 0x8F40,
	0x9040, 0x9140, 0x9240, 0x9340, 0x9440, 0x9540, 0x9640, 0x9740,			0x9840, 0x9940, 0x9A40, 0x9B40, 0x9C40, 0x9D40, 0x9E40, 0x9F40,
	0xA040, 0xA140, 0xA240, 0xA340, 0xA440, 0xA540, 0xA640, 0xA740,			0xA840, 0xA940, 0xAA40, 0xAB40, 0xAC40, 0xAD40, 0xAE40, 0xAF40,
	0xB040, 0xB140, 0xB240, 0xB340, 0xB440, 0xB540, 0xB640, 0xB740,			0xB840, 0xB940, 0xBA40, 0xBB40, 0xBC40, 0xBD40, 0xBE40, 0xBF40,
	0xC040, 0xC140, 0xC240, 0xC340, 0xC440, 0xC540, 0xC640, 0xC740,			0xC840, 0xC940, 0xCA40, 0xCB40, 0xCC40, 0xCD40, 0xCE40, 0xCF40,
	0xD040, 0xD140, 0xD240, 0xD340, 0xD440, 0xD540, 0xD640, 0xD740,			0xD840, 0xD940, 0xDA40, 0xDB40, 0xDC40, 0xDD40, 0xDE40, 0xDF40,
	0xE040, 0xE140, 0xE240, 0xE340, 0xE440, 0xE540, 0xE640, 0xE740,			0xE840, 0xE940, 0xEA40, 0xEB40, 0xEC40, 0xED40, 0xEE40, 0xEF40,
	0xF040, 0xF140, 0xF240, 0xF340, 0xF440, 0xF540, 0xF640, 0xF740,			0xF840, 0xF940, 0xFA40, 0xFB40, 0xFC40, 0xFD40, 0xFE40, 0xFF40,
	0xA050, 0xA150, 0xA250, 0xA350, 0xA450, 0xA550, 0xA650, 0xA750,			0xA850, 0xA950, 0xAA50, 0xAB50, 0xAC50, 0xAD50, 0xAE50, 0xAF50,
	0xB050, 0xB150, 0xB250, 0xB350, 0xB450, 0xB550, 0xB650, 0xB750,			0xB850, 0xB950, 0xBA50, 0xBB50, 0xBC50, 0xBD50, 0xBE50, 0xBF50,
	0xC050, 0xC150, 0xC250, 0xC350, 0xC450, 0xC550, 0xC650, 0xC750,			0xC850, 0xC950, 0xCA50, 0xCB50, 0xCC50, 0xCD50, 0xCE50, 0xCF50,
	0xD050, 0xD150, 0xD250, 0xD350, 0xD450, 0xD550, 0xD650, 0xD750,			0xD850, 0xD950, 0xDA50, 0xDB50, 0xDC50, 0xDD50, 0xDE50, 0xDF50,
	0xE050, 0xE150, 0xE250, 0xE350, 0xE450, 0xE550, 0xE650, 0xE750,			0xE850, 0xE950, 0xEA50, 0xEB50, 0xEC50, 0xED50, 0xEE50, 0xEF50,
	0xF050, 0xF150, 0xF250, 0xF350, 0xF450, 0xF550, 0xF650, 0xF750,			0xF850, 0xF950, 0xFA50, 0xFB50, 0xFC50, 0xFD50, 0xFE50, 0xFF50,
	0x00D0, 0x0150, 0x0250, 0x0350, 0x0450, 0x0550, 0x0650, 0x0750,			0x0850, 0x0950, 0x0A50, 0x0B50, 0x0C50, 0x0D50, 0x0E50, 0x0F50,
	0x1050, 0x1150, 0x1250, 0x1350, 0x1450, 0x1550, 0x1650, 0x1750,			0x1850, 0x1950, 0x1A50, 0x1B50, 0x1C50, 0x1D50, 0x1E50, 0x1F50,
	0x2050, 0x2150, 0x2250, 0x2350, 0x2450, 0x2550, 0x2650, 0x2750,			0x2850, 0x2950, 0x2A50, 0x2B50, 0x2C50, 0x2D50, 0x2E50, 0x2F50,
	0x3050, 0x3150, 0x3250, 0x3350, 0x3450, 0x3550, 0x3650, 0x3750,			0x3850, 0x3950, 0x3A50, 0x3B50, 0x3C50, 0x3D50, 0x3E50, 0x3F50,
	0x4050, 0x4150, 0x4250, 0x4350, 0x4450, 0x4550, 0x4650, 0x4750,			0x4850, 0x4950, 0x4A50, 0x4B50, 0x4C50, 0x4D50, 0x4E50, 0x4F50,
	0x5050, 0x5150, 0x5250, 0x5350, 0x5450, 0x5550, 0x5650, 0x5750,			0x5850, 0x5950, 0x5A50, 0x5B50, 0x5C50, 0x5D50, 0x5E50, 0x5F50,
	0x6050, 0x6150, 0x6250, 0x6350, 0x6450, 0x6550, 0x6650, 0x6750,			0x6850, 0x6950, 0x6A50, 0x6B50, 0x6C50, 0x6D50, 0x6E50, 0x6F50,
	0x7050, 0x7150, 0x7250, 0x7350, 0x7450, 0x7550, 0x7650, 0x7750,			0x7850, 0x7950, 0x7A50, 0x7B50, 0x7C50, 0x7D50, 0x7E50, 0x7F50,
	0x8050, 0x8150, 0x8250, 0x8350, 0x8450, 0x8550, 0x8650, 0x8750,			0x8850, 0x8950, 0x8A50, 0x8B50, 0x8C50, 0x8D50, 0x8E50, 0x8F50,
	0x9050, 0x9150, 0x9250, 0x9350, 0x9450, 0x9550, 0x9650, 0x9750,			0x9850, 0x9950, 0x9A50, 0x9B50, 0x9C50, 0x9D50, 0x9E50, 0x9F50,
	0xFA40, 0xFB40, 0xFC40, 0xFD40, 0xFE40, 0xFF40, 0x00C0, 0x0140,			0x0240, 0x0340, 0x0440, 0x0540, 0x0640, 0x0740, 0x0840, 0x0940,
	0x0A40, 0x0B40, 0x0C40, 0x0D40, 0x0E40, 0x0F40, 0x1040, 0x1140,			0x1240, 0x1340, 0x1440, 0x1540, 0x1640, 0x1740, 0x1840, 0x1940,
	0x1A40, 0x1B40, 0x1C40, 0x1D40, 0x1E40, 0x1F40, 0x2040, 0x2140,			0x2240, 0x2340, 0x2440, 0x2540, 0x2640, 0x2740, 0x2840, 0x2940,
	0x2A40, 0x2B40, 0x2C40, 0x2D40, 0x2E40, 0x2F40, 0x3040, 0x3140,			0x3240, 0x3340, 0x3440, 0x3540, 0x3640, 0x3740, 0x3840, 0x3940,
	0x3A40, 0x3B40, 0x3C40, 0x3D40, 0x3E40, 0x3F40, 0x4040, 0x4140,			0x4240, 0x4340, 0x4440, 0x4540, 0x4640, 0x4740, 0x4840, 0x4940,
	0x4A40, 0x4B40, 0x4C40, 0x4D40, 0x4E40, 0x4F40, 0x5040, 0x5140,			0x5240, 0x5340, 0x5440, 0x5540, 0x5640, 0x5740, 0x5840, 0x5940,
	0x5A40, 0x5B40, 0x5C40, 0x5D40, 0x5E40, 0x5F40, 0x6040, 0x6140,			0x6240, 0x6340, 0x6440, 0x6540, 0x6640, 0x6740, 0x6840, 0x6940,
	0x6A40, 0x6B40, 0x6C40, 0x6D40, 0x6E40, 0x6F40, 0x7040, 0x7140,			0x7240, 0x7340, 0x7440, 0x7540, 0x7640, 0x7740, 0x7840, 0x7940,
	0x7A40, 0x7B40, 0x7C40, 0x7D40, 0x7E40, 0x7F40, 0x8040, 0x8140,			0x8240, 0x8340, 0x8440, 0x8540, 0x8640, 0x8740, 0x8840, 0x8940,
	0x8A40, 0x8B40, 0x8C40, 0x8D40, 0x8E40, 0x8F40, 0x9040, 0x9140,			0x9240, 0x9340, 0x9440, 0x9540, 0x9640, 0x9740, 0x9840, 0x9940,
	0x9A40, 0x9B40, 0x9C40, 0x9D40, 0x9E40, 0x9F40, 0xA040, 0xA140,			0xA240, 0xA340, 0xA440, 0xA540, 0xA640, 0xA740, 0xA840, 0xA940,
	0xAA40, 0xAB40, 0xAC40, 0xAD40, 0xAE40, 0xAF40, 0xB040, 0xB140,			0xB240, 0xB340, 0xB440, 0xB540, 0xB640, 0xB740, 0xB840, 0xB940,
	0xBA40, 0xBB40, 0xBC40, 0xBD40, 0xBE40, 0xBF40, 0xC040, 0xC140,			0xC240, 0xC340, 0xC440, 0xC540, 0xC640, 0xC740, 0xC840, 0xC940,
	0xCA40, 0xCB40, 0xCC40, 0xCD40, 0xCE40, 0xCF40, 0xD040, 0xD140,			0xD240, 0xD340, 0xD440, 0xD540, 0xD640, 0xD740, 0xD840, 0xD940,
	0xDA40, 0xDB40, 0xDC40, 0xDD40, 0xDE40, 0xDF40, 0xE040, 0xE140,			0xE240, 0xE340, 0xE440, 0xE540, 0xE640, 0xE740, 0xE840, 0xE940,
	0xEA40, 0xEB40, 0xEC40, 0xED40, 0xEE40, 0xEF40, 0xF040, 0xF140,			0xF240, 0xF340, 0xF440, 0xF540, 0xF640, 0xF740, 0xF840, 0xF940,
	0x9A50, 0x9B50, 0x9C50, 0x9D50, 0x9E50, 0x9F50, 0xA050, 0xA150,			0xA250, 0xA350, 0xA450, 0xA550, 0xA650, 0xA750, 0xA850, 0xA950,
	0xAA50, 0xAB50, 0xAC50, 0xAD50, 0xAE50, 0xAF50, 0xB050, 0xB150,			0xB250, 0xB350, 0xB450, 0xB550, 0xB650, 0xB750, 0xB850, 0xB950,
	0xBA50, 0xBB50, 0xBC50, 0xBD50, 0xBE50, 0xBF50, 0xC050, 0xC150,			0xC250, 0xC350, 0xC450, 0xC550, 0xC650, 0xC750, 0xC850, 0xC950,
	0xCA50, 0xCB50, 0xCC50, 0xCD50, 0xCE50, 0xCF50, 0xD050, 0xD150,			0xD250, 0xD350, 0xD450, 0xD550, 0xD650, 0xD750, 0xD850, 0xD950,
	0xDA50, 0xDB50, 0xDC50, 0xDD50, 0xDE50, 0xDF50, 0xE050, 0xE150,			0xE250, 0xE350, 0xE450, 0xE550, 0xE650, 0xE750, 0xE850, 0xE950,
	0xEA50, 0xEB50, 0xEC50, 0xED50, 0xEE50, 0xEF50, 0xF050, 0xF150,			0xF250, 0xF350, 0xF450, 0xF550, 0xF650, 0xF750, 0xF850, 0xF950,
	0xFA50, 0xFB50, 0xFC50, 0xFD50, 0xFE50, 0xFF50, 0x00D0, 0x0150,			0x0250, 0x0350, 0x0450, 0x0550, 0x0650, 0x0750, 0x0850, 0x0950,
	0x0A50, 0x0B50, 0x0C50, 0x0D50, 0x0E50, 0x0F50, 0x1050, 0x1150,			0x1250, 0x1350, 0x1450, 0x1550, 0x1650, 0x1750, 0x1850, 0x1950,
	0x1A50, 0x1B50, 0x1C50, 0x1D50, 0x1E50, 0x1F50, 0x2050, 0x2150,			0x2250, 0x2350, 0x2450, 0x2550, 0x2650, 0x2750, 0x2850, 0x2950,
	0x2A50, 0x2B50, 0x2C50, 0x2D50, 0x2E50, 0x2F50, 0x3050, 0x3150,			0x3250, 0x3350, 0x3450, 0x3550, 0x3650, 0x3750, 0x3850, 0x3950,
	0x3A50, 0x3B50, 0x3C50, 0x3D50, 0x3E50, 0x3F50, 0x4050, 0x4150,			0x4250, 0x4350, 0x4450, 0x4550, 0x4650, 0x4750, 0x4850, 0x4950,
	0x4A50, 0x4B50, 0x4C50, 0x4D50, 0x4E50, 0x4F50, 0x5050, 0x5150,			0x5250, 0x5350, 0x5450, 0x5550, 0x5650, 0x5750, 0x5850, 0x5950,
	0x5A50, 0x5B50, 0x5C50, 0x5D50, 0x5E50, 0x5F50, 0x6050, 0x6150,			0x6250, 0x6350, 0x6450, 0x6550, 0x6650, 0x6750, 0x6850, 0x6950,
	0x6A50, 0x6B50, 0x6C50, 0x6D50, 0x6E50, 0x6F50, 0x7050, 0x7150,			0x7250, 0x7350, 0x7450, 0x7550, 0x7650, 0x7750, 0x7850, 0x7950,
	0x7A50, 0x7B50, 0x7C50, 0x7D50, 0x7E50, 0x7F50, 0x8050, 0x8150,			0x8250, 0x8350, 0x8450, 0x8550, 0x8650, 0x8750, 0x8850, 0x8950,
	0x8A50, 0x8B50, 0x8C50, 0x8D50, 0x8E50, 0x8F50, 0x9050, 0x9150,			0x9250, 0x9350, 0x9450, 0x9550, 0x9650, 0x9750, 0x9850, 0x9950
);
GameBoyCore.prototype.GBCBOOTROM = new Array(	//GBC BOOT ROM (Thanks to Costis for the binary dump that I converted to this):
	//This way of loading in the BOOT ROM reminds me of when people had to punchcard the data in. :P
	0x31, 0xfe, 0xff, 0x3e, 0x02, 0xc3, 0x7c, 0x00, 	0xd3, 0x00, 0x98, 0xa0, 0x12, 0xd3, 0x00, 0x80, 
	0x00, 0x40, 0x1e, 0x53, 0xd0, 0x00, 0x1f, 0x42, 	0x1c, 0x00, 0x14, 0x2a, 0x4d, 0x19, 0x8c, 0x7e, 
	0x00, 0x7c, 0x31, 0x6e, 0x4a, 0x45, 0x52, 0x4a, 	0x00, 0x00, 0xff, 0x53, 0x1f, 0x7c, 0xff, 0x03, 
	0x1f, 0x00, 0xff, 0x1f, 0xa7, 0x00, 0xef, 0x1b, 	0x1f, 0x00, 0xef, 0x1b, 0x00, 0x7c, 0x00, 0x00, 
	0xff, 0x03, 0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 	0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 
	0x00, 0x0d, 0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 	0x00, 0x0e, 0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 
	0xd9, 0x99, 0xbb, 0xbb, 0x67, 0x63, 0x6e, 0x0e, 	0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 
	0x33, 0x3e, 0x3c, 0x42, 0xb9, 0xa5, 0xb9, 0xa5, 	0x42, 0x3c, 0x58, 0x43, 0xe0, 0x70, 0x3e, 0xfc, 
	0xe0, 0x47, 0xcd, 0x75, 0x02, 0xcd, 0x00, 0x02, 	0x26, 0xd0, 0xcd, 0x03, 0x02, 0x21, 0x00, 0xfe, 
	0x0e, 0xa0, 0xaf, 0x22, 0x0d, 0x20, 0xfc, 0x11, 	0x04, 0x01, 0x21, 0x10, 0x80, 0x4c, 0x1a, 0xe2, 
	0x0c, 0xcd, 0xc6, 0x03, 0xcd, 0xc7, 0x03, 0x13, 	0x7b, 0xfe, 0x34, 0x20, 0xf1, 0x11, 0x72, 0x00, 
	0x06, 0x08, 0x1a, 0x13, 0x22, 0x23, 0x05, 0x20, 	0xf9, 0xcd, 0xf0, 0x03, 0x3e, 0x01, 0xe0, 0x4f, 
	0x3e, 0x91, 0xe0, 0x40, 0x21, 0xb2, 0x98, 0x06, 	0x4e, 0x0e, 0x44, 0xcd, 0x91, 0x02, 0xaf, 0xe0, 
	0x4f, 0x0e, 0x80, 0x21, 0x42, 0x00, 0x06, 0x18, 	0xf2, 0x0c, 0xbe, 0x20, 0xfe, 0x23, 0x05, 0x20, 
	0xf7, 0x21, 0x34, 0x01, 0x06, 0x19, 0x78, 0x86, 	0x2c, 0x05, 0x20, 0xfb, 0x86, 0x20, 0xfe, 0xcd, 
	0x1c, 0x03, 0x18, 0x02, 0x00, 0x00, 0xcd, 0xd0, 	0x05, 0xaf, 0xe0, 0x70, 0x3e, 0x11, 0xe0, 0x50, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
	0x21, 0x00, 0x80, 0xaf, 0x22, 0xcb, 0x6c, 0x28, 	0xfb, 0xc9, 0x2a, 0x12, 0x13, 0x0d, 0x20, 0xfa, 
	0xc9, 0xe5, 0x21, 0x0f, 0xff, 0xcb, 0x86, 0xcb, 	0x46, 0x28, 0xfc, 0xe1, 0xc9, 0x11, 0x00, 0xff, 
	0x21, 0x03, 0xd0, 0x0e, 0x0f, 0x3e, 0x30, 0x12, 	0x3e, 0x20, 0x12, 0x1a, 0x2f, 0xa1, 0xcb, 0x37, 
	0x47, 0x3e, 0x10, 0x12, 0x1a, 0x2f, 0xa1, 0xb0, 	0x4f, 0x7e, 0xa9, 0xe6, 0xf0, 0x47, 0x2a, 0xa9, 
	0xa1, 0xb0, 0x32, 0x47, 0x79, 0x77, 0x3e, 0x30, 	0x12, 0xc9, 0x3e, 0x80, 0xe0, 0x68, 0xe0, 0x6a, 
	0x0e, 0x6b, 0x2a, 0xe2, 0x05, 0x20, 0xfb, 0x4a, 	0x09, 0x43, 0x0e, 0x69, 0x2a, 0xe2, 0x05, 0x20, 
	0xfb, 0xc9, 0xc5, 0xd5, 0xe5, 0x21, 0x00, 0xd8, 	0x06, 0x01, 0x16, 0x3f, 0x1e, 0x40, 0xcd, 0x4a, 
	0x02, 0xe1, 0xd1, 0xc1, 0xc9, 0x3e, 0x80, 0xe0, 	0x26, 0xe0, 0x11, 0x3e, 0xf3, 0xe0, 0x12, 0xe0, 
	0x25, 0x3e, 0x77, 0xe0, 0x24, 0x21, 0x30, 0xff, 	0xaf, 0x0e, 0x10, 0x22, 0x2f, 0x0d, 0x20, 0xfb, 
	0xc9, 0xcd, 0x11, 0x02, 0xcd, 0x62, 0x02, 0x79, 	0xfe, 0x38, 0x20, 0x14, 0xe5, 0xaf, 0xe0, 0x4f, 
	0x21, 0xa7, 0x99, 0x3e, 0x38, 0x22, 0x3c, 0xfe, 	0x3f, 0x20, 0xfa, 0x3e, 0x01, 0xe0, 0x4f, 0xe1, 
	0xc5, 0xe5, 0x21, 0x43, 0x01, 0xcb, 0x7e, 0xcc, 	0x89, 0x05, 0xe1, 0xc1, 0xcd, 0x11, 0x02, 0x79, 
	0xd6, 0x30, 0xd2, 0x06, 0x03, 0x79, 0xfe, 0x01, 	0xca, 0x06, 0x03, 0x7d, 0xfe, 0xd1, 0x28, 0x21, 
	0xc5, 0x06, 0x03, 0x0e, 0x01, 0x16, 0x03, 0x7e, 	0xe6, 0xf8, 0xb1, 0x22, 0x15, 0x20, 0xf8, 0x0c, 
	0x79, 0xfe, 0x06, 0x20, 0xf0, 0x11, 0x11, 0x00, 	0x19, 0x05, 0x20, 0xe7, 0x11, 0xa1, 0xff, 0x19, 
	0xc1, 0x04, 0x78, 0x1e, 0x83, 0xfe, 0x62, 0x28, 	0x06, 0x1e, 0xc1, 0xfe, 0x64, 0x20, 0x07, 0x7b, 
	0xe0, 0x13, 0x3e, 0x87, 0xe0, 0x14, 0xfa, 0x02, 	0xd0, 0xfe, 0x00, 0x28, 0x0a, 0x3d, 0xea, 0x02, 
	0xd0, 0x79, 0xfe, 0x01, 0xca, 0x91, 0x02, 0x0d, 	0xc2, 0x91, 0x02, 0xc9, 0x0e, 0x26, 0xcd, 0x4a, 
	0x03, 0xcd, 0x11, 0x02, 0xcd, 0x62, 0x02, 0x0d, 	0x20, 0xf4, 0xcd, 0x11, 0x02, 0x3e, 0x01, 0xe0, 
	0x4f, 0xcd, 0x3e, 0x03, 0xcd, 0x41, 0x03, 0xaf, 	0xe0, 0x4f, 0xcd, 0x3e, 0x03, 0xc9, 0x21, 0x08, 
	0x00, 0x11, 0x51, 0xff, 0x0e, 0x05, 0xcd, 0x0a, 	0x02, 0xc9, 0xc5, 0xd5, 0xe5, 0x21, 0x40, 0xd8, 
	0x0e, 0x20, 0x7e, 0xe6, 0x1f, 0xfe, 0x1f, 0x28, 	0x01, 0x3c, 0x57, 0x2a, 0x07, 0x07, 0x07, 0xe6, 
	0x07, 0x47, 0x3a, 0x07, 0x07, 0x07, 0xe6, 0x18, 	0xb0, 0xfe, 0x1f, 0x28, 0x01, 0x3c, 0x0f, 0x0f, 
	0x0f, 0x47, 0xe6, 0xe0, 0xb2, 0x22, 0x78, 0xe6, 	0x03, 0x5f, 0x7e, 0x0f, 0x0f, 0xe6, 0x1f, 0xfe, 
	0x1f, 0x28, 0x01, 0x3c, 0x07, 0x07, 0xb3, 0x22, 	0x0d, 0x20, 0xc7, 0xe1, 0xd1, 0xc1, 0xc9, 0x0e, 
	0x00, 0x1a, 0xe6, 0xf0, 0xcb, 0x49, 0x28, 0x02, 	0xcb, 0x37, 0x47, 0x23, 0x7e, 0xb0, 0x22, 0x1a, 
	0xe6, 0x0f, 0xcb, 0x49, 0x20, 0x02, 0xcb, 0x37, 	0x47, 0x23, 0x7e, 0xb0, 0x22, 0x13, 0xcb, 0x41, 
	0x28, 0x0d, 0xd5, 0x11, 0xf8, 0xff, 0xcb, 0x49, 	0x28, 0x03, 0x11, 0x08, 0x00, 0x19, 0xd1, 0x0c, 
	0x79, 0xfe, 0x18, 0x20, 0xcc, 0xc9, 0x47, 0xd5, 	0x16, 0x04, 0x58, 0xcb, 0x10, 0x17, 0xcb, 0x13, 
	0x17, 0x15, 0x20, 0xf6, 0xd1, 0x22, 0x23, 0x22, 	0x23, 0xc9, 0x3e, 0x19, 0xea, 0x10, 0x99, 0x21, 
	0x2f, 0x99, 0x0e, 0x0c, 0x3d, 0x28, 0x08, 0x32, 	0x0d, 0x20, 0xf9, 0x2e, 0x0f, 0x18, 0xf3, 0xc9, 
	0x3e, 0x01, 0xe0, 0x4f, 0xcd, 0x00, 0x02, 0x11, 	0x07, 0x06, 0x21, 0x80, 0x80, 0x0e, 0xc0, 0x1a, 
	0x22, 0x23, 0x22, 0x23, 0x13, 0x0d, 0x20, 0xf7, 	0x11, 0x04, 0x01, 0xcd, 0x8f, 0x03, 0x01, 0xa8, 
	0xff, 0x09, 0xcd, 0x8f, 0x03, 0x01, 0xf8, 0xff, 	0x09, 0x11, 0x72, 0x00, 0x0e, 0x08, 0x23, 0x1a, 
	0x22, 0x13, 0x0d, 0x20, 0xf9, 0x21, 0xc2, 0x98, 	0x06, 0x08, 0x3e, 0x08, 0x0e, 0x10, 0x22, 0x0d, 
	0x20, 0xfc, 0x11, 0x10, 0x00, 0x19, 0x05, 0x20, 	0xf3, 0xaf, 0xe0, 0x4f, 0x21, 0xc2, 0x98, 0x3e, 
	0x08, 0x22, 0x3c, 0xfe, 0x18, 0x20, 0x02, 0x2e, 	0xe2, 0xfe, 0x28, 0x20, 0x03, 0x21, 0x02, 0x99, 
	0xfe, 0x38, 0x20, 0xed, 0x21, 0xd8, 0x08, 0x11, 	0x40, 0xd8, 0x06, 0x08, 0x3e, 0xff, 0x12, 0x13, 
	0x12, 0x13, 0x0e, 0x02, 0xcd, 0x0a, 0x02, 0x3e, 	0x00, 0x12, 0x13, 0x12, 0x13, 0x13, 0x13, 0x05, 
	0x20, 0xea, 0xcd, 0x62, 0x02, 0x21, 0x4b, 0x01, 	0x7e, 0xfe, 0x33, 0x20, 0x0b, 0x2e, 0x44, 0x1e, 
	0x30, 0x2a, 0xbb, 0x20, 0x49, 0x1c, 0x18, 0x04, 	0x2e, 0x4b, 0x1e, 0x01, 0x2a, 0xbb, 0x20, 0x3e, 
	0x2e, 0x34, 0x01, 0x10, 0x00, 0x2a, 0x80, 0x47, 	0x0d, 0x20, 0xfa, 0xea, 0x00, 0xd0, 0x21, 0xc7, 
	0x06, 0x0e, 0x00, 0x2a, 0xb8, 0x28, 0x08, 0x0c, 	0x79, 0xfe, 0x4f, 0x20, 0xf6, 0x18, 0x1f, 0x79, 
	0xd6, 0x41, 0x38, 0x1c, 0x21, 0x16, 0x07, 0x16, 	0x00, 0x5f, 0x19, 0xfa, 0x37, 0x01, 0x57, 0x7e, 
	0xba, 0x28, 0x0d, 0x11, 0x0e, 0x00, 0x19, 0x79, 	0x83, 0x4f, 0xd6, 0x5e, 0x38, 0xed, 0x0e, 0x00, 
	0x21, 0x33, 0x07, 0x06, 0x00, 0x09, 0x7e, 0xe6, 	0x1f, 0xea, 0x08, 0xd0, 0x7e, 0xe6, 0xe0, 0x07, 
	0x07, 0x07, 0xea, 0x0b, 0xd0, 0xcd, 0xe9, 0x04, 	0xc9, 0x11, 0x91, 0x07, 0x21, 0x00, 0xd9, 0xfa, 
	0x0b, 0xd0, 0x47, 0x0e, 0x1e, 0xcb, 0x40, 0x20, 	0x02, 0x13, 0x13, 0x1a, 0x22, 0x20, 0x02, 0x1b, 
	0x1b, 0xcb, 0x48, 0x20, 0x02, 0x13, 0x13, 0x1a, 	0x22, 0x13, 0x13, 0x20, 0x02, 0x1b, 0x1b, 0xcb, 
	0x50, 0x28, 0x05, 0x1b, 0x2b, 0x1a, 0x22, 0x13, 	0x1a, 0x22, 0x13, 0x0d, 0x20, 0xd7, 0x21, 0x00, 
	0xd9, 0x11, 0x00, 0xda, 0xcd, 0x64, 0x05, 0xc9, 	0x21, 0x12, 0x00, 0xfa, 0x05, 0xd0, 0x07, 0x07, 
	0x06, 0x00, 0x4f, 0x09, 0x11, 0x40, 0xd8, 0x06, 	0x08, 0xe5, 0x0e, 0x02, 0xcd, 0x0a, 0x02, 0x13, 
	0x13, 0x13, 0x13, 0x13, 0x13, 0xe1, 0x05, 0x20, 	0xf0, 0x11, 0x42, 0xd8, 0x0e, 0x02, 0xcd, 0x0a, 
	0x02, 0x11, 0x4a, 0xd8, 0x0e, 0x02, 0xcd, 0x0a, 	0x02, 0x2b, 0x2b, 0x11, 0x44, 0xd8, 0x0e, 0x02, 
	0xcd, 0x0a, 0x02, 0xc9, 0x0e, 0x60, 0x2a, 0xe5, 	0xc5, 0x21, 0xe8, 0x07, 0x06, 0x00, 0x4f, 0x09, 
	0x0e, 0x08, 0xcd, 0x0a, 0x02, 0xc1, 0xe1, 0x0d, 	0x20, 0xec, 0xc9, 0xfa, 0x08, 0xd0, 0x11, 0x18, 
	0x00, 0x3c, 0x3d, 0x28, 0x03, 0x19, 0x20, 0xfa, 	0xc9, 0xcd, 0x1d, 0x02, 0x78, 0xe6, 0xff, 0x28, 
	0x0f, 0x21, 0xe4, 0x08, 0x06, 0x00, 0x2a, 0xb9, 	0x28, 0x08, 0x04, 0x78, 0xfe, 0x0c, 0x20, 0xf6, 
	0x18, 0x2d, 0x78, 0xea, 0x05, 0xd0, 0x3e, 0x1e, 	0xea, 0x02, 0xd0, 0x11, 0x0b, 0x00, 0x19, 0x56, 
	0x7a, 0xe6, 0x1f, 0x5f, 0x21, 0x08, 0xd0, 0x3a, 	0x22, 0x7b, 0x77, 0x7a, 0xe6, 0xe0, 0x07, 0x07, 
	0x07, 0x5f, 0x21, 0x0b, 0xd0, 0x3a, 0x22, 0x7b, 	0x77, 0xcd, 0xe9, 0x04, 0xcd, 0x28, 0x05, 0xc9, 
	0xcd, 0x11, 0x02, 0xfa, 0x43, 0x01, 0xcb, 0x7f, 	0x28, 0x04, 0xe0, 0x4c, 0x18, 0x28, 0x3e, 0x04, 
	0xe0, 0x4c, 0x3e, 0x01, 0xe0, 0x6c, 0x21, 0x00, 	0xda, 0xcd, 0x7b, 0x05, 0x06, 0x10, 0x16, 0x00, 
	0x1e, 0x08, 0xcd, 0x4a, 0x02, 0x21, 0x7a, 0x00, 	0xfa, 0x00, 0xd0, 0x47, 0x0e, 0x02, 0x2a, 0xb8, 
	0xcc, 0xda, 0x03, 0x0d, 0x20, 0xf8, 0xc9, 0x01, 	0x0f, 0x3f, 0x7e, 0xff, 0xff, 0xc0, 0x00, 0xc0, 
	0xf0, 0xf1, 0x03, 0x7c, 0xfc, 0xfe, 0xfe, 0x03, 	0x07, 0x07, 0x0f, 0xe0, 0xe0, 0xf0, 0xf0, 0x1e, 
	0x3e, 0x7e, 0xfe, 0x0f, 0x0f, 0x1f, 0x1f, 0xff, 	0xff, 0x00, 0x00, 0x01, 0x01, 0x01, 0x03, 0xff, 
	0xff, 0xe1, 0xe0, 0xc0, 0xf0, 0xf9, 0xfb, 0x1f, 	0x7f, 0xf8, 0xe0, 0xf3, 0xfd, 0x3e, 0x1e, 0xe0, 
	0xf0, 0xf9, 0x7f, 0x3e, 0x7c, 0xf8, 0xe0, 0xf8, 	0xf0, 0xf0, 0xf8, 0x00, 0x00, 0x7f, 0x7f, 0x07, 
	0x0f, 0x9f, 0xbf, 0x9e, 0x1f, 0xff, 0xff, 0x0f, 	0x1e, 0x3e, 0x3c, 0xf1, 0xfb, 0x7f, 0x7f, 0xfe, 
	0xde, 0xdf, 0x9f, 0x1f, 0x3f, 0x3e, 0x3c, 0xf8, 	0xf8, 0x00, 0x00, 0x03, 0x03, 0x07, 0x07, 0xff, 
	0xff, 0xc1, 0xc0, 0xf3, 0xe7, 0xf7, 0xf3, 0xc0, 	0xc0, 0xc0, 0xc0, 0x1f, 0x1f, 0x1e, 0x3e, 0x3f, 
	0x1f, 0x3e, 0x3e, 0x80, 0x00, 0x00, 0x00, 0x7c, 	0x1f, 0x07, 0x00, 0x0f, 0xff, 0xfe, 0x00, 0x7c, 
	0xf8, 0xf0, 0x00, 0x1f, 0x0f, 0x0f, 0x00, 0x7c, 	0xf8, 0xf8, 0x00, 0x3f, 0x3e, 0x1c, 0x00, 0x0f, 
	0x0f, 0x0f, 0x00, 0x7c, 0xff, 0xff, 0x00, 0x00, 	0xf8, 0xf8, 0x00, 0x07, 0x0f, 0x0f, 0x00, 0x81, 
	0xff, 0xff, 0x00, 0xf3, 0xe1, 0x80, 0x00, 0xe0, 	0xff, 0x7f, 0x00, 0xfc, 0xf0, 0xc0, 0x00, 0x3e, 
	0x7c, 0x7c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 	0x88, 0x16, 0x36, 0xd1, 0xdb, 0xf2, 0x3c, 0x8c, 
	0x92, 0x3d, 0x5c, 0x58, 0xc9, 0x3e, 0x70, 0x1d, 	0x59, 0x69, 0x19, 0x35, 0xa8, 0x14, 0xaa, 0x75, 
	0x95, 0x99, 0x34, 0x6f, 0x15, 0xff, 0x97, 0x4b, 	0x90, 0x17, 0x10, 0x39, 0xf7, 0xf6, 0xa2, 0x49, 
	0x4e, 0x43, 0x68, 0xe0, 0x8b, 0xf0, 0xce, 0x0c, 	0x29, 0xe8, 0xb7, 0x86, 0x9a, 0x52, 0x01, 0x9d, 
	0x71, 0x9c, 0xbd, 0x5d, 0x6d, 0x67, 0x3f, 0x6b, 	0xb3, 0x46, 0x28, 0xa5, 0xc6, 0xd3, 0x27, 0x61, 
	0x18, 0x66, 0x6a, 0xbf, 0x0d, 0xf4, 0x42, 0x45, 	0x46, 0x41, 0x41, 0x52, 0x42, 0x45, 0x4b, 0x45, 
	0x4b, 0x20, 0x52, 0x2d, 0x55, 0x52, 0x41, 0x52, 	0x20, 0x49, 0x4e, 0x41, 0x49, 0x4c, 0x49, 0x43, 
	0x45, 0x20, 0x52, 0x7c, 0x08, 0x12, 0xa3, 0xa2, 	0x07, 0x87, 0x4b, 0x20, 0x12, 0x65, 0xa8, 0x16, 
	0xa9, 0x86, 0xb1, 0x68, 0xa0, 0x87, 0x66, 0x12, 	0xa1, 0x30, 0x3c, 0x12, 0x85, 0x12, 0x64, 0x1b, 
	0x07, 0x06, 0x6f, 0x6e, 0x6e, 0xae, 0xaf, 0x6f, 	0xb2, 0xaf, 0xb2, 0xa8, 0xab, 0x6f, 0xaf, 0x86, 
	0xae, 0xa2, 0xa2, 0x12, 0xaf, 0x13, 0x12, 0xa1, 	0x6e, 0xaf, 0xaf, 0xad, 0x06, 0x4c, 0x6e, 0xaf, 
	0xaf, 0x12, 0x7c, 0xac, 0xa8, 0x6a, 0x6e, 0x13, 	0xa0, 0x2d, 0xa8, 0x2b, 0xac, 0x64, 0xac, 0x6d, 
	0x87, 0xbc, 0x60, 0xb4, 0x13, 0x72, 0x7c, 0xb5, 	0xae, 0xae, 0x7c, 0x7c, 0x65, 0xa2, 0x6c, 0x64, 
	0x85, 0x80, 0xb0, 0x40, 0x88, 0x20, 0x68, 0xde, 	0x00, 0x70, 0xde, 0x20, 0x78, 0x20, 0x20, 0x38, 
	0x20, 0xb0, 0x90, 0x20, 0xb0, 0xa0, 0xe0, 0xb0, 	0xc0, 0x98, 0xb6, 0x48, 0x80, 0xe0, 0x50, 0x1e, 
	0x1e, 0x58, 0x20, 0xb8, 0xe0, 0x88, 0xb0, 0x10, 	0x20, 0x00, 0x10, 0x20, 0xe0, 0x18, 0xe0, 0x18, 
	0x00, 0x18, 0xe0, 0x20, 0xa8, 0xe0, 0x20, 0x18, 	0xe0, 0x00, 0x20, 0x18, 0xd8, 0xc8, 0x18, 0xe0, 
	0x00, 0xe0, 0x40, 0x28, 0x28, 0x28, 0x18, 0xe0, 	0x60, 0x20, 0x18, 0xe0, 0x00, 0x00, 0x08, 0xe0, 
	0x18, 0x30, 0xd0, 0xd0, 0xd0, 0x20, 0xe0, 0xe8, 	0xff, 0x7f, 0xbf, 0x32, 0xd0, 0x00, 0x00, 0x00, 
	0x9f, 0x63, 0x79, 0x42, 0xb0, 0x15, 0xcb, 0x04, 	0xff, 0x7f, 0x31, 0x6e, 0x4a, 0x45, 0x00, 0x00, 
	0xff, 0x7f, 0xef, 0x1b, 0x00, 0x02, 0x00, 0x00, 	0xff, 0x7f, 0x1f, 0x42, 0xf2, 0x1c, 0x00, 0x00, 
	0xff, 0x7f, 0x94, 0x52, 0x4a, 0x29, 0x00, 0x00, 	0xff, 0x7f, 0xff, 0x03, 0x2f, 0x01, 0x00, 0x00, 
	0xff, 0x7f, 0xef, 0x03, 0xd6, 0x01, 0x00, 0x00, 	0xff, 0x7f, 0xb5, 0x42, 0xc8, 0x3d, 0x00, 0x00, 
	0x74, 0x7e, 0xff, 0x03, 0x80, 0x01, 0x00, 0x00, 	0xff, 0x67, 0xac, 0x77, 0x13, 0x1a, 0x6b, 0x2d, 
	0xd6, 0x7e, 0xff, 0x4b, 0x75, 0x21, 0x00, 0x00, 	0xff, 0x53, 0x5f, 0x4a, 0x52, 0x7e, 0x00, 0x00, 
	0xff, 0x4f, 0xd2, 0x7e, 0x4c, 0x3a, 0xe0, 0x1c, 	0xed, 0x03, 0xff, 0x7f, 0x5f, 0x25, 0x00, 0x00, 
	0x6a, 0x03, 0x1f, 0x02, 0xff, 0x03, 0xff, 0x7f, 	0xff, 0x7f, 0xdf, 0x01, 0x12, 0x01, 0x00, 0x00, 
	0x1f, 0x23, 0x5f, 0x03, 0xf2, 0x00, 0x09, 0x00, 	0xff, 0x7f, 0xea, 0x03, 0x1f, 0x01, 0x00, 0x00, 
	0x9f, 0x29, 0x1a, 0x00, 0x0c, 0x00, 0x00, 0x00, 	0xff, 0x7f, 0x7f, 0x02, 0x1f, 0x00, 0x00, 0x00, 
	0xff, 0x7f, 0xe0, 0x03, 0x06, 0x02, 0x20, 0x01, 	0xff, 0x7f, 0xeb, 0x7e, 0x1f, 0x00, 0x00, 0x7c, 
	0xff, 0x7f, 0xff, 0x3f, 0x00, 0x7e, 0x1f, 0x00, 	0xff, 0x7f, 0xff, 0x03, 0x1f, 0x00, 0x00, 0x00, 
	0xff, 0x03, 0x1f, 0x00, 0x0c, 0x00, 0x00, 0x00, 	0xff, 0x7f, 0x3f, 0x03, 0x93, 0x01, 0x00, 0x00, 
	0x00, 0x00, 0x00, 0x42, 0x7f, 0x03, 0xff, 0x7f, 	0xff, 0x7f, 0x8c, 0x7e, 0x00, 0x7c, 0x00, 0x00, 
	0xff, 0x7f, 0xef, 0x1b, 0x80, 0x61, 0x00, 0x00, 	0xff, 0x7f, 0x00, 0x7c, 0xe0, 0x03, 0x1f, 0x7c, 
	0x1f, 0x00, 0xff, 0x03, 0x40, 0x41, 0x42, 0x20, 	0x21, 0x22, 0x80, 0x81, 0x82, 0x10, 0x11, 0x12, 
	0x12, 0xb0, 0x79, 0xb8, 0xad, 0x16, 0x17, 0x07, 	0xba, 0x05, 0x7c, 0x13, 0x00, 0x00, 0x00, 0x00
);
GameBoyCore.prototype.ffxxDump = new Array(	//Dump of the post-BOOT I/O register state (From gambatte):
	0x0F, 0x00, 0x7C, 0xFF, 0x43, 0x00, 0x00, 0xF8, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
	0x80, 0xBF, 0xF3, 0xFF, 0xBF, 0xFF, 0x3F, 0x00, 	0xFF, 0xBF, 0x7F, 0xFF, 0x9F, 0xFF, 0xBF, 0xFF,
	0xFF, 0x00, 0x00, 0xBF, 0x77, 0xF3, 0xF1, 0xFF, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
	0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 	0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF,
	0x91, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFC, 	0x00, 0x00, 0x00, 0x00, 0xFF, 0x7E, 0xFF, 0xFE,
	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x3E, 0xFF, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 	0xC0, 0xFF, 0xC1, 0x00, 0xFE, 0xFF, 0xFF, 0xFF,
	0xF8, 0xFF, 0x00, 0x00, 0x00, 0x8F, 0x00, 0x00, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
	0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B, 	0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
	0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E, 	0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
	0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC, 	0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,
	0x45, 0xEC, 0x52, 0xFA, 0x08, 0xB7, 0x07, 0x5D, 	0x01, 0xFD, 0xC0, 0xFF, 0x08, 0xFC, 0x00, 0xE5,
	0x0B, 0xF8, 0xC2, 0xCE, 0xF4, 0xF9, 0x0F, 0x7F, 	0x45, 0x6D, 0x3D, 0xFE, 0x46, 0x97, 0x33, 0x5E,
	0x08, 0xEF, 0xF1, 0xFF, 0x86, 0x83, 0x24, 0x74, 	0x12, 0xFC, 0x00, 0x9F, 0xB4, 0xB7, 0x06, 0xD5,
	0xD0, 0x7A, 0x00, 0x9E, 0x04, 0x5F, 0x41, 0x2F, 	0x1D, 0x77, 0x36, 0x75, 0x81, 0xAA, 0x70, 0x3A,
	0x98, 0xD1, 0x71, 0x02, 0x4D, 0x01, 0xC1, 0xFF, 	0x0D, 0x00, 0xD3, 0x05, 0xF9, 0x00, 0x0B, 0x00
);
GameBoyCore.prototype.OPCODE = new Array(
	//NOP
	//#0x00:
	function (parentObj) {
		//Do Nothing...
	},
	//LD BC, nn
	//#0x01:
	function (parentObj) {
		parentObj.registerC = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.registerB = parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//LD (BC), A
	//#0x02:
	function (parentObj) {
		parentObj.memoryWrite((parentObj.registerB << 8) + parentObj.registerC, parentObj.registerA);
	},
	//INC BC
	//#0x03:
	function (parentObj) {
		var temp_var = (((parentObj.registerB << 8) + parentObj.registerC) + 1);
		parentObj.registerB = ((temp_var >> 8) & 0xFF);
		parentObj.registerC = (temp_var & 0xFF);
	},
	//INC B
	//#0x04:
	function (parentObj) {
		parentObj.registerB = ((parentObj.registerB + 1) & 0xFF);
		parentObj.FZero = (parentObj.registerB == 0);
		parentObj.FHalfCarry = ((parentObj.registerB & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC B
	//#0x05:
	function (parentObj) {
		parentObj.registerB = parentObj.unsbtub(parentObj.registerB - 1);
		parentObj.FZero = (parentObj.registerB == 0);
		parentObj.FHalfCarry = ((parentObj.registerB & 0xF) == 0xF);
		parentObj.FSubtract = true;
	},
	//LD B, n
	//#0x06:
	function (parentObj) {
		parentObj.registerB = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//RLCA
	//#0x07:
	function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x80) == 0x80);
		parentObj.registerA = ((parentObj.registerA << 1) & 0xFF) | (parentObj.registerA >> 7);
		parentObj.FZero = parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//LD (nn), SP
	//#0x08:
	function (parentObj) {
		var temp_var = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.memoryWrite(temp_var, parentObj.stackPointer & 0xFF);
		parentObj.memoryWrite((temp_var + 1) & 0xFFFF, parentObj.stackPointer >> 8);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//ADD HL, BC
	//#0x09:
	function (parentObj) {
		var n2 = (parentObj.registerB << 8) + parentObj.registerC;
		var dirtySum = parentObj.registersHL + n2;
		parentObj.FHalfCarry = ((parentObj.registersHL & 0xFFF) + (n2 & 0xFFF) > 0xFFF);
		parentObj.FCarry = (dirtySum > 0xFFFF);
		parentObj.registersHL = (dirtySum & 0xFFFF);
		parentObj.FSubtract = false;
	},
	//LD A, (BC)
	//#0x0A:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryRead((parentObj.registerB << 8) + parentObj.registerC);
	},
	//DEC BC
	//#0x0B:
	function (parentObj) {
		var temp_var = (((parentObj.registerB << 8) + parentObj.registerC) - 1) & 0xFFFF;
		parentObj.registerB = (temp_var >> 8);
		parentObj.registerC = (temp_var & 0xFF);
	},
	//INC C
	//#0x0C:
	function (parentObj) {
		parentObj.registerC = ((parentObj.registerC + 1) & 0xFF);
		parentObj.FZero = (parentObj.registerC == 0);
		parentObj.FHalfCarry = ((parentObj.registerC & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC C
	//#0x0D:
	function (parentObj) {
		parentObj.registerC = parentObj.unsbtub(parentObj.registerC - 1);
		parentObj.FZero = (parentObj.registerC == 0);
		parentObj.FHalfCarry = ((parentObj.registerC & 0xF) == 0xF);
		parentObj.FSubtract = true;
	},
	//LD C, n
	//#0x0E:
	function (parentObj) {
		parentObj.registerC = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//RRCA
	//#0x0F:
	function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 1) == 1);
		parentObj.registerA = (parentObj.registerA >> 1) + ((parentObj.registerA & 1) << 7);
		parentObj.FZero = parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//STOP
	//#0x10:
	function (parentObj) {
		if (parentObj.cGBC) {
			/*TODO: Emulate the speed switch delay:
				Delay Amount:
				16 ms when going to double-speed.
				32 ms when going to single-speed.
				Also, bits 4 and 5 of 0xFF00 should read as set (1), while the switch is in process.
			*/
			if ((parentObj.memory[0xFF4D] & 0x01) == 0x01) {		//Speed change requested.
				if ((parentObj.memory[0xFF4D] & 0x80) == 0x80) {	//Go back to single speed mode.
					cout("Going into single clock speed mode.", 0);
					parentObj.multiplier = 1;						//TODO: Move this into the delay done code.
					parentObj.memory[0xFF4D] &= 0x7F;				//Clear the double speed mode flag.
				}
				else {												//Go to double speed mode.
					cout("Going into double clock speed mode.", 0);
					parentObj.multiplier = 2;						//TODO: Move this into the delay done code.
					parentObj.memory[0xFF4D] |= 0x80;				//Set the double speed mode flag.
				}
				parentObj.memory[0xFF4D] &= 0xFE;					//Reset the request bit.
			}
		}
	},
	//LD DE, nn
	//#0x11:
	function (parentObj) {
		parentObj.registerE = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.registerD = parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//LD (DE), A
	//#0x12:
	function (parentObj) {
		parentObj.memoryWrite((parentObj.registerD << 8) + parentObj.registerE, parentObj.registerA);
	},
	//INC DE
	//#0x13:
	function (parentObj) {
		var temp_var = (((parentObj.registerD << 8) + parentObj.registerE) + 1);
		parentObj.registerD = ((temp_var >> 8) & 0xFF);
		parentObj.registerE = (temp_var & 0xFF);
	},
	//INC D
	//#0x14:
	function (parentObj) {
		parentObj.registerD = ((parentObj.registerD + 1) & 0xFF);
		parentObj.FZero = (parentObj.registerD == 0);
		parentObj.FHalfCarry = ((parentObj.registerD & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC D
	//#0x15:
	function (parentObj) {
		parentObj.registerD = parentObj.unsbtub(parentObj.registerD - 1);
		parentObj.FZero = (parentObj.registerD == 0);
		parentObj.FHalfCarry = ((parentObj.registerD & 0xF) == 0xF);
		parentObj.FSubtract = true;
	},
	//LD D, n
	//#0x16:
	function (parentObj) {
		parentObj.registerD = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//RLA
	//#0x17:
	function (parentObj) {
		var carry_flag = (parentObj.FCarry) ? 1 : 0;
		parentObj.FCarry = ((parentObj.registerA & 0x80) == 0x80);
		parentObj.registerA = ((parentObj.registerA << 1) & 0xFF) | carry_flag;
		parentObj.FZero = parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//JR n
	//#0x18:
	function (parentObj) {
		parentObj.programCounter = (parentObj.programCounter + parentObj.usbtsb(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter)) + 1) & 0xFFFF;
	},
	//ADD HL, DE
	//#0x19:
	function (parentObj) {
		var n2 = (parentObj.registerD << 8) + parentObj.registerE;
		var dirtySum = parentObj.registersHL + n2;
		parentObj.FHalfCarry = ((parentObj.registersHL & 0xFFF) + (n2 & 0xFFF) > 0xFFF);
		parentObj.FCarry = (dirtySum > 0xFFFF);
		parentObj.registersHL = (dirtySum & 0xFFFF);
		parentObj.FSubtract = false;
	},
	//LD A, (DE)
	//#0x1A:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryRead((parentObj.registerD << 8) + parentObj.registerE);
	},
	//DEC DE
	//#0x1B:
	function (parentObj) {
		var temp_var = (((parentObj.registerD << 8) + parentObj.registerE) - 1) & 0xFFFF;
		parentObj.registerD = (temp_var >> 8);
		parentObj.registerE = (temp_var & 0xFF);
	},
	//INC E
	//#0x1C:
	function (parentObj) {
		parentObj.registerE = ((parentObj.registerE + 1) & 0xFF);
		parentObj.FZero = (parentObj.registerE == 0);
		parentObj.FHalfCarry = ((parentObj.registerE & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC E
	//#0x1D:
	function (parentObj) {
		parentObj.registerE = parentObj.unsbtub(parentObj.registerE - 1);
		parentObj.FZero = (parentObj.registerE == 0);
		parentObj.FHalfCarry = ((parentObj.registerE & 0xF) == 0xF);
		parentObj.FSubtract = true;
	},
	//LD E, n
	//#0x1E:
	function (parentObj) {
		parentObj.registerE = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//RRA
	//#0x1F:
	function (parentObj) {
		var carry_flag = (parentObj.FCarry) ? 0x80 : 0;
		parentObj.FCarry = ((parentObj.registerA & 1) == 1);
		parentObj.registerA = (parentObj.registerA >> 1) + carry_flag;
		parentObj.FZero = parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//JR NZ, n
	//#0x20:
	function (parentObj) {
		if (!parentObj.FZero) {
			parentObj.programCounter = (parentObj.programCounter + parentObj.usbtsb(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter)) + 1) & 0xFFFF;
			parentObj.CPUTicks++;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		}
	},
	//LD HL, nn
	//#0x21:
	function (parentObj) {
		parentObj.registersHL = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//LDI (HL), A
	//#0x22:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.registerA);
		parentObj.registersHL = ((parentObj.registersHL + 1) & 0xFFFF);
	},
	//INC HL
	//#0x23:
	function (parentObj) {
		parentObj.registersHL = ((parentObj.registersHL + 1) & 0xFFFF);
	},
	//INC H
	//#0x24:
	function (parentObj) {
		var H = (((parentObj.registersHL >> 8) + 1) & 0xFF);
		parentObj.FZero = (H == 0);
		parentObj.FHalfCarry = ((H & 0xF) == 0);
		parentObj.FSubtract = false;
		parentObj.registersHL = (H << 8) + (parentObj.registersHL & 0xFF);
	},
	//DEC H
	//#0x25:
	function (parentObj) {
		var H = parentObj.unsbtub((parentObj.registersHL >> 8) - 1);
		parentObj.FZero = (H == 0);
		parentObj.FHalfCarry = ((H & 0xF) == 0xF);
		parentObj.FSubtract = true;
		parentObj.registersHL = (H << 8) + (parentObj.registersHL & 0xFF);
	},
	//LD H, n
	//#0x26:
	function (parentObj) {
		parentObj.registersHL = (parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 8) + (parentObj.registersHL & 0xFF);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//DAA
	//#0x27:
	function (parentObj) {
		var temp_var = parentObj.registerA;
		if (parentObj.FCarry) {
			temp_var |= 0x100;
		}
		if (parentObj.FHalfCarry) {
			temp_var |= 0x200;
		}
		if (parentObj.FSubtract) {
			temp_var |= 0x400;
		}
		parentObj.registerA = (temp_var = parentObj.DAATable[temp_var]) >> 8;
		parentObj.FZero = ((temp_var & 0x80) == 0x80);
		parentObj.FSubtract = ((temp_var & 0x40) == 0x40);
		parentObj.FHalfCarry = ((temp_var & 0x20) == 0x20);
		parentObj.FCarry = ((temp_var & 0x10) == 0x10);
	},
	//JR Z, n
	//#0x28:
	function (parentObj) {
		if (parentObj.FZero) {
			parentObj.programCounter = (parentObj.programCounter + parentObj.usbtsb(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter)) + 1) & 0xFFFF;
			parentObj.CPUTicks++;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		}
	},
	//ADD HL, HL
	//#0x29:
	function (parentObj) {;
		parentObj.FHalfCarry = ((parentObj.registersHL & 0xFFF) > 0x7FF);
		parentObj.FCarry = (parentObj.registersHL > 0x7FFF);
		parentObj.registersHL = ((2 * parentObj.registersHL) & 0xFFFF);
		parentObj.FSubtract = false;
	},
	//LDI A, (HL)
	//#0x2A:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.registersHL = ((parentObj.registersHL + 1) & 0xFFFF);
	},
	//DEC HL
	//#0x2B:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL - 1) & 0xFFFF;
	},
	//INC L
	//#0x2C:
	function (parentObj) {
		var L = ((parentObj.registersHL + 1) & 0xFF);
		parentObj.FZero = (L == 0);
		parentObj.FHalfCarry = ((L & 0xF) == 0);
		parentObj.FSubtract = false;
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + L;
	},
	//DEC L
	//#0x2D:
	function (parentObj) {
		var L = parentObj.unsbtub((parentObj.registersHL & 0xFF) - 1);
		parentObj.FZero = (L == 0);
		parentObj.FHalfCarry = ((L & 0xF) == 0xF);
		parentObj.FSubtract = true;
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + L;
	},
	//LD L, n
	//#0x2E:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//CPL
	//#0x2F:
	function (parentObj) {
		parentObj.registerA ^= 0xFF;
		parentObj.FSubtract = parentObj.FHalfCarry = true;
	},
	//JR NC, n
	//#0x30:
	function (parentObj) {
		if (!parentObj.FCarry) {
			parentObj.programCounter = (parentObj.programCounter + parentObj.usbtsb(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter)) + 1) & 0xFFFF;
			parentObj.CPUTicks++;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		}
	},
	//LD SP, nn
	//#0x31:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//LDD (HL), A
	//#0x32:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.registerA);
		parentObj.registersHL = (parentObj.registersHL - 1) & 0xFFFF;
	},
	//INC SP
	//#0x33:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer + 1) & 0xFFFF;
	},
	//INC (HL)
	//#0x34:
	function (parentObj) {
		var temp_var = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) + 1) & 0xFF);
		parentObj.FZero = (temp_var == 0);
		parentObj.FHalfCarry = ((temp_var & 0xF) == 0);
		parentObj.FSubtract = false;
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
	},
	//DEC (HL)
	//#0x35:
	function (parentObj) {
		var temp_var = parentObj.unsbtub(parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) - 1);
		parentObj.FZero = (temp_var == 0);
		parentObj.FHalfCarry = ((temp_var & 0xF) == 0xF);
		parentObj.FSubtract = true;
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
	},
	//LD (HL), n
	//#0x36:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter));
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//SCF
	//#0x37:
	function (parentObj) {
		parentObj.FCarry = true;
		parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//JR C, n
	//#0x38:
	function (parentObj) {
		if (parentObj.FCarry) {
			parentObj.programCounter = (parentObj.programCounter + parentObj.usbtsb(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter)) + 1) & 0xFFFF;
			parentObj.CPUTicks++;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		}
	},
	//ADD HL, SP
	//#0x39:
	function (parentObj) {
		var dirtySum = parentObj.registersHL + parentObj.stackPointer;
		parentObj.FHalfCarry = ((parentObj.registersHL & 0xFFF) + (parentObj.stackPointer & 0xFFF) > 0xFFF);
		parentObj.FCarry = (dirtySum > 0xFFFF);
		parentObj.registersHL = (dirtySum & 0xFFFF);
		parentObj.FSubtract = false;
	},
	// LDD A, (HL)
	//#0x3A:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.registersHL = (parentObj.registersHL - 1) & 0xFFFF;
	},
	//DEC SP
	//#0x3B:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
	},
	//INC A
	//#0x3C:
	function (parentObj) {
		parentObj.registerA = ((parentObj.registerA + 1) & 0xFF);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC A
	//#0x3D:
	function (parentObj) {
		parentObj.registerA = parentObj.unsbtub(parentObj.registerA - 1);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) == 0xF);
		parentObj.FSubtract = true;
	},
	//LD A, n
	//#0x3E:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//CCF
	//#0x3F:
	function (parentObj) {
		parentObj.FCarry = !parentObj.FCarry;
		parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//LD B, B
	//#0x40:
	function (parentObj) {
		//Do nothing...
	},
	//LD B, C
	//#0x41:
	function (parentObj) {
		parentObj.registerB = parentObj.registerC;
	},
	//LD B, D
	//#0x42:
	function (parentObj) {
		parentObj.registerB = parentObj.registerD;
	},
	//LD B, E
	//#0x43:
	function (parentObj) {
		parentObj.registerB = parentObj.registerE;
	},
	//LD B, H
	//#0x44:
	function (parentObj) {
		parentObj.registerB = (parentObj.registersHL >> 8);
	},
	//LD B, L
	//#0x45:
	function (parentObj) {
		parentObj.registerB = (parentObj.registersHL & 0xFF);
	},
	//LD B, (HL)
	//#0x46:
	function (parentObj) {
		parentObj.registerB = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
	},
	//LD B, A
	//#0x47:
	function (parentObj) {
		parentObj.registerB = parentObj.registerA;
	},
	//LD C, B
	//#0x48:
	function (parentObj) {
		parentObj.registerC = parentObj.registerB;
	},
	//LD C, C
	//#0x49:
	function (parentObj) {
		//Do nothing...
	},
	//LD C, D
	//#0x4A:
	function (parentObj) {
		parentObj.registerC = parentObj.registerD;
	},
	//LD C, E
	//#0x4B:
	function (parentObj) {
		parentObj.registerC = parentObj.registerE;
	},
	//LD C, H
	//#0x4C:
	function (parentObj) {
		parentObj.registerC = (parentObj.registersHL >> 8);
	},
	//LD C, L
	//#0x4D:
	function (parentObj) {
		parentObj.registerC = (parentObj.registersHL & 0xFF);
	},
	//LD C, (HL)
	//#0x4E:
	function (parentObj) {
		parentObj.registerC = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
	},
	//LD C, A
	//#0x4F:
	function (parentObj) {
		parentObj.registerC = parentObj.registerA;
	},
	//LD D, B
	//#0x50:
	function (parentObj) {
		parentObj.registerD = parentObj.registerB;
	},
	//LD D, C
	//#0x51:
	function (parentObj) {
		parentObj.registerD = parentObj.registerC;
	},
	//LD D, D
	//#0x52:
	function (parentObj) {
		//Do nothing...
	},
	//LD D, E
	//#0x53:
	function (parentObj) {
		parentObj.registerD = parentObj.registerE;
	},
	//LD D, H
	//#0x54:
	function (parentObj) {
		parentObj.registerD = (parentObj.registersHL >> 8);
	},
	//LD D, L
	//#0x55:
	function (parentObj) {
		parentObj.registerD = (parentObj.registersHL & 0xFF);
	},
	//LD D, (HL)
	//#0x56:
	function (parentObj) {
		parentObj.registerD = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
	},
	//LD D, A
	//#0x57:
	function (parentObj) {
		parentObj.registerD = parentObj.registerA;
	},
	//LD E, B
	//#0x58:
	function (parentObj) {
		parentObj.registerE = parentObj.registerB;
	},
	//LD E, C
	//#0x59:
	function (parentObj) {
		parentObj.registerE = parentObj.registerC;
	},
	//LD E, D
	//#0x5A:
	function (parentObj) {
		parentObj.registerE = parentObj.registerD;
	},
	//LD E, E
	//#0x5B:
	function (parentObj) {
		//Do nothing...
	},
	//LD E, H
	//#0x5C:
	function (parentObj) {
		parentObj.registerE = (parentObj.registersHL >> 8);
	},
	//LD E, L
	//#0x5D:
	function (parentObj) {
		parentObj.registerE = (parentObj.registersHL & 0xFF);
	},
	//LD E, (HL)
	//#0x5E:
	function (parentObj) {
		parentObj.registerE = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
	},
	//LD E, A
	//#0x5F:
	function (parentObj) {
		parentObj.registerE = parentObj.registerA;
	},
	//LD H, B
	//#0x60:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerB << 8) + (parentObj.registersHL & 0xFF);
	},
	//LD H, C
	//#0x61:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerC << 8) + (parentObj.registersHL & 0xFF);
	},
	//LD H, D
	//#0x62:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerD << 8) + (parentObj.registersHL & 0xFF);
	},
	//LD H, E
	//#0x63:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerE << 8) + (parentObj.registersHL & 0xFF);
	},
	//LD H, H
	//#0x64:
	function (parentObj) {
		//Do nothing...
	},
	//LD H, L
	//#0x65:
	function (parentObj) {
		parentObj.registersHL = ((parentObj.registersHL & 0xFF) << 8) + (parentObj.registersHL & 0xFF);
	},
	//LD H, (HL)
	//#0x66:
	function (parentObj) {
		parentObj.registersHL = (parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) << 8) + (parentObj.registersHL & 0xFF);
	},
	//LD H, A
	//#0x67:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerA << 8) + (parentObj.registersHL & 0xFF);
	},
	//LD L, B
	//#0x68:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + parentObj.registerB;
	},
	//LD L, C
	//#0x69:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + parentObj.registerC;
	},
	//LD L, D
	//#0x6A:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + parentObj.registerD;
	},
	//LD L, E
	//#0x6B:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + parentObj.registerE;
	},
	//LD L, H
	//#0x6C:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + (parentObj.registersHL >> 8);
	},
	//LD L, L
	//#0x6D:
	function (parentObj) {
		//Do nothing...
	},
	//LD L, (HL)
	//#0x6E:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
	},
	//LD L, A
	//#0x6F:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + parentObj.registerA;
	},
	//LD (HL), B
	//#0x70:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.registerB);
	},
	//LD (HL), C
	//#0x71:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.registerC);
	},
	//LD (HL), D
	//#0x72:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.registerD);
	},
	//LD (HL), E
	//#0x73:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.registerE);
	},
	//LD (HL), H
	//#0x74:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, (parentObj.registersHL >> 8));
	},
	//LD (HL), L
	//#0x75:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, (parentObj.registersHL & 0xFF));
	},
	//HALT
	//#0x76:
	function (parentObj) {
		if (parentObj.untilEnable == 1) {
			/*VBA-M says this fixes Torpedo Range (Seems to work):
			Involves an edge case where an EI is placed right before a HALT.
			EI in this case actually is immediate, so we adjust (Hacky?).*/
			parentObj.programCounter = (parentObj.programCounter - 1) & 0xFFFF;
		}
		else {
			if (!parentObj.halt && !parentObj.IME && !parentObj.cGBC && !parentObj.usedBootROM && (parentObj.memory[0xFF0F] & parentObj.memory[0xFFFF] & 0x1F) > 0) {
				parentObj.skipPCIncrement = true;
			}
			parentObj.halt = true;
			while (parentObj.halt && (parentObj.stopEmulator & 1) == 0) {
				/*We're hijacking the main interpreter loop to do this dirty business
				in order to not slow down the main interpreter loop code with halt state handling.*/
				var bitShift = 0;
				var testbit = 1;
				var interrupts = parentObj.memory[0xFFFF] & parentObj.memory[0xFF0F];
				while (bitShift < 5) {
					//Check to see if an interrupt is enabled AND requested.
					if ((testbit & interrupts) == testbit) {
						parentObj.halt = false;		//Get out of halt state if in halt state.
						return;						//Let the main interrupt handler compute the interrupt.
					}
					testbit = 1 << ++bitShift;
				}
				parentObj.CPUTicks = 1;				//1 machine cycle under HALT...
				//Timing:
				parentObj.updateCore();
			}
			throw(new Error("HALT_OVERRUN"));		//Throw an error on purpose to exit out of the loop.
		}
	},
	//LD (HL), A
	//#0x77:
	function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.registerA);
	},
	//LD A, B
	//#0x78:
	function (parentObj) {
		parentObj.registerA = parentObj.registerB;
	},
	//LD A, C
	//#0x79:
	function (parentObj) {
		parentObj.registerA = parentObj.registerC;
	},
	//LD A, D
	//#0x7A:
	function (parentObj) {
		parentObj.registerA = parentObj.registerD;
	},
	//LD A, E
	//#0x7B:
	function (parentObj) {
		parentObj.registerA = parentObj.registerE;
	},
	//LD A, H
	//#0x7C:
	function (parentObj) {
		parentObj.registerA = (parentObj.registersHL >> 8);
	},
	//LD A, L
	//#0x7D:
	function (parentObj) {
		parentObj.registerA = (parentObj.registersHL & 0xFF);
	},
	//LD, A, (HL)
	//#0x7E:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
	},
	//LD A, A
	//#0x7F:
	function (parentObj) {
		//Do Nothing...
	},
	//ADD A, B
	//#0x80:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerB;
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, C
	//#0x81:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerC;
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, D
	//#0x82:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerD;
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, E
	//#0x83:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerE;
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, H
	//#0x84:
	function (parentObj) {
		var dirtySum = parentObj.registerA + (parentObj.registersHL >> 8);
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, L
	//#0x85:
	function (parentObj) {
		var dirtySum = parentObj.registerA + (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, (HL)
	//#0x86:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, A
	//#0x87:
	function (parentObj) {
		var dirtySum = parentObj.registerA * 2;
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADC A, B
	//#0x88:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerB + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (parentObj.registerB & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADC A, C
	//#0x89:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerC + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (parentObj.registerC & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADC A, D
	//#0x8A:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerD + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (parentObj.registerD & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADC A, E
	//#0x8B:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerE + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (parentObj.registerE & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADC A, H
	//#0x8C:
	function (parentObj) {
		var tempValue = (parentObj.registersHL >> 8);
		var dirtySum = parentObj.registerA + tempValue + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (tempValue & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADC A, L
	//#0x8D:
	function (parentObj) {
		var tempValue = (parentObj.registersHL & 0xFF);
		var dirtySum = parentObj.registerA + tempValue + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (tempValue & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADC A, (HL)
	//#0x8E:
	function (parentObj) {
		var tempValue = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		var dirtySum = parentObj.registerA + tempValue + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (tempValue & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADC A, A
	//#0x8F:
	function (parentObj) {
		var dirtySum = (parentObj.registerA * 2) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (parentObj.registerA & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//SUB A, B
	//#0x90:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerB;
		parentObj.FHalfCarry = (parentObj.registerA & 0xF) < (parentObj.registerB & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, C
	//#0x91:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerC;
		parentObj.FHalfCarry = (parentObj.registerA & 0xF) < (parentObj.registerC & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, D
	//#0x92:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerD;
		parentObj.FHalfCarry = (parentObj.registerA & 0xF) < (parentObj.registerD & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, E
	//#0x93:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerE;
		parentObj.FHalfCarry = (parentObj.registerA & 0xF) < (parentObj.registerE & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, H
	//#0x94:
	function (parentObj) {
		var temp_var = parentObj.registersHL >> 8;
		var dirtySum = parentObj.registerA - temp_var;
		parentObj.FHalfCarry = (parentObj.registerA & 0xF) < (temp_var & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, L
	//#0x95:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = (parentObj.registerA & 0xF) < (parentObj.registersHL & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, (HL)
	//#0x96:
	function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		var dirtySum = parentObj.registerA - temp_var;
		parentObj.FHalfCarry = (parentObj.registerA & 0xF) < (temp_var & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, A
	//#0x97:
	function (parentObj) {
		//number - same number == 0
		parentObj.registerA = 0;
		parentObj.FHalfCarry = parentObj.FCarry = false;
		parentObj.FZero = parentObj.FSubtract = true;
	},
	//SBC A, B
	//#0x98:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerB - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registerB & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, C
	//#0x99:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerC - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registerC & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, D
	//#0x9A:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerD - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registerD & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, E
	//#0x9B:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerE - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registerE & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, H
	//#0x9C:
	function (parentObj) {
		var temp_var = parentObj.registersHL >> 8;
		var dirtySum = parentObj.registerA - temp_var - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (temp_var & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, L
	//#0x9D:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL & 0xFF) - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registersHL & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, (HL)
	//#0x9E:
	function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		var dirtySum = parentObj.registerA - temp_var - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (temp_var & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, A
	//#0x9F:
	function (parentObj) {
		//Optimized SBC A:
		if (parentObj.FCarry) {
			parentObj.FZero = false;
			parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = true;
			parentObj.registerA = 0xFF;
		}
		else {
			parentObj.FHalfCarry = parentObj.FCarry = false;
			parentObj.FSubtract = parentObj.FZero = true;
			parentObj.registerA = 0;
		}
	},
	//AND B
	//#0xA0:
	function (parentObj) {
		parentObj.registerA &= parentObj.registerB;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//AND C
	//#0xA1:
	function (parentObj) {
		parentObj.registerA &= parentObj.registerC;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//AND D
	//#0xA2:
	function (parentObj) {
		parentObj.registerA &= parentObj.registerD;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//AND E
	//#0xA3:
	function (parentObj) {
		parentObj.registerA &= parentObj.registerE;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//AND H
	//#0xA4:
	function (parentObj) {
		parentObj.registerA &= (parentObj.registersHL >> 8);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//AND L
	//#0xA5:
	function (parentObj) {
		parentObj.registerA &= (parentObj.registersHL & 0xFF);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//AND (HL)
	//#0xA6:
	function (parentObj) {
		parentObj.registerA &= parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//AND A
	//#0xA7:
	function (parentObj) {
		//number & same number = same number
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//XOR B
	//#0xA8:
	function (parentObj) {
		parentObj.registerA ^= parentObj.registerB;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//XOR C
	//#0xA9:
	function (parentObj) {
		parentObj.registerA ^= parentObj.registerC;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//XOR D
	//#0xAA:
	function (parentObj) {
		parentObj.registerA ^= parentObj.registerD;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//XOR E
	//#0xAB:
	function (parentObj) {
		parentObj.registerA ^= parentObj.registerE;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//XOR H
	//#0xAC:
	function (parentObj) {
		parentObj.registerA ^= (parentObj.registersHL >> 8);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//XOR L
	//#0xAD:
	function (parentObj) {
		parentObj.registerA ^= (parentObj.registersHL & 0xFF);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//XOR (HL)
	//#0xAE:
	function (parentObj) {
		parentObj.registerA ^= parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//XOR A
	//#0xAF:
	function (parentObj) {
		//number ^ same number == 0
		parentObj.registerA = 0;
		parentObj.FZero = true;
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//OR B
	//#0xB0:
	function (parentObj) {
		parentObj.registerA |= parentObj.registerB;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//OR C
	//#0xB1:
	function (parentObj) {
		parentObj.registerA |= parentObj.registerC;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//OR D
	//#0xB2:
	function (parentObj) {
		parentObj.registerA |= parentObj.registerD;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//OR E
	//#0xB3:
	function (parentObj) {
		parentObj.registerA |= parentObj.registerE;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//OR H
	//#0xB4:
	function (parentObj) {
		parentObj.registerA |= (parentObj.registersHL >> 8);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//OR L
	//#0xB5:
	function (parentObj) {
		parentObj.registerA |= (parentObj.registersHL & 0xFF);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//OR (HL)
	//#0xB6:
	function (parentObj) {
		parentObj.registerA |= parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//OR A
	//#0xB7:
	function (parentObj) {
		//number | same number == same number
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//CP B
	//#0xB8:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerB;
		parentObj.FHalfCarry = (parentObj.unsbtub(dirtySum) & 0xF) > (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP C
	//#0xB9:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerC;
		parentObj.FHalfCarry = (parentObj.unsbtub(dirtySum) & 0xF) > (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP D
	//#0xBA:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerD;
		parentObj.FHalfCarry = (parentObj.unsbtub(dirtySum) & 0xF) > (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP E
	//#0xBB:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerE;
		parentObj.FHalfCarry = (parentObj.unsbtub(dirtySum) & 0xF) > (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP H
	//#0xBC:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL >> 8);
		parentObj.FHalfCarry = (parentObj.unsbtub(dirtySum) & 0xF) > (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP L
	//#0xBD:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = (parentObj.unsbtub(dirtySum) & 0xF) > (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP (HL)
	//#0xBE:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FHalfCarry = (parentObj.unsbtub(dirtySum) & 0xF) > (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP A
	//#0xBF:
	function (parentObj) {
		parentObj.FHalfCarry = parentObj.FCarry = false;
		parentObj.FZero = parentObj.FSubtract = true;
	},
	//RET !FZ
	//#0xC0:
	function (parentObj) {
		if (!parentObj.FZero) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
			parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
			parentObj.CPUTicks += 3;
		}
	},
	//POP BC
	//#0xC1:
	function (parentObj) {
		parentObj.registerC = parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.registerB = parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
	},
	//JP !FZ, nn
	//#0xC2:
	function (parentObj) {
		if (!parentObj.FZero) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.CPUTicks++;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//JP nn
	//#0xC3:
	function (parentObj) {
		parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
	},
	//CALL !FZ, nn
	//#0xC4:
	function (parentObj) {
		if (!parentObj.FZero) {
			var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
			parentObj.programCounter = temp_pc;
			parentObj.CPUTicks += 3;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//PUSH BC
	//#0xC5:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.registerB);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.registerC);
	},
	//ADD, n
	//#0xC6:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.FHalfCarry = (dirtySum & 0xF) < (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//RST 0
	//#0xC7:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0;
	},
	//RET FZ
	//#0xC8:
	function (parentObj) {
		if (parentObj.FZero) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
			parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
			parentObj.CPUTicks += 3;
		}
	},
	//RET
	//#0xC9:
	function (parentObj) {
		parentObj.programCounter =  (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
	},
	//JP FZ, nn
	//#0xCA:
	function (parentObj) {
		if (parentObj.FZero) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.CPUTicks++;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//Secondary OP Code Set:
	//#0xCB:
	function (parentObj) {
		var opcode = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		//Increment the program counter to the next instruction:
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		//Get how many CPU cycles the current 0xCBXX op code counts for:
		parentObj.CPUTicks = parentObj.SecondaryTICKTable[opcode];
		//Execute secondary OP codes for the 0xCB OP code call.
		parentObj.CBOPCODE[opcode](parentObj);
	},
	//CALL FZ, nn
	//#0xCC:
	function (parentObj) {
		if (parentObj.FZero) {
			var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
			parentObj.programCounter = temp_pc;
			parentObj.CPUTicks += 3;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//CALL nn
	//#0xCD:
	function (parentObj) {
		var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = temp_pc;
	},
	//ADC A, n
	//#0xCE:
	function (parentObj) {
		var tempValue = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		var dirtySum = parentObj.registerA + tempValue + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (tempValue & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//RST 0x8
	//#0xCF:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x8;
	},
	//RET !FC
	//#0xD0:
	function (parentObj) {
		if (!parentObj.FCarry) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
			parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
			parentObj.CPUTicks += 3;
		}
	},
	//POP DE
	//#0xD1:
	function (parentObj) {
		parentObj.registerE = parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.registerD = parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
	},
	//JP !FC, nn
	//#0xD2:
	function (parentObj) {
		if (!parentObj.FCarry) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.CPUTicks++;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//0xD3 - Illegal
	//#0xD3:
	function (parentObj) {
		cout("Illegal op code 0xD3 called, pausing emulation.", 2);
		pause();
	},
	//CALL !FC, nn
	//#0xD4:
	function (parentObj) {
		if (!parentObj.FCarry) {
			var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
			parentObj.programCounter = temp_pc;
			parentObj.CPUTicks += 3;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//PUSH DE
	//#0xD5:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.registerD);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.registerE);
	},
	//SUB A, n
	//#0xD6:
	function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		var dirtySum = parentObj.registerA - temp_var;
		parentObj.FHalfCarry = (parentObj.registerA & 0xF) < (temp_var & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//RST 0x10
	//#0xD7:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x10;
	},
	//RET FC
	//#0xD8:
	function (parentObj) {
		if (parentObj.FCarry) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
			parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
			parentObj.CPUTicks += 3;
		}
	},
	//RETI
	//#0xD9:
	function (parentObj) {
		parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
		//parentObj.IME = true;
		parentObj.untilEnable = 2;
	},
	//JP FC, nn
	//#0xDA:
	function (parentObj) {
		if (parentObj.FCarry) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.CPUTicks++;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//0xDB - Illegal
	//#0xDB:
	function (parentObj) {
		cout("Illegal op code 0xDB called, pausing emulation.", 2);
		pause();
	},
	//CALL FC, nn
	//#0xDC:
	function (parentObj) {
		if (parentObj.FCarry) {
			var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
			parentObj.programCounter = temp_pc;
			parentObj.CPUTicks += 3;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//0xDD - Illegal
	//#0xDD:
	function (parentObj) {
		cout("Illegal op code 0xDD called, pausing emulation.", 2);
		pause();
	},
	//SBC A, n
	//#0xDE:
	function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		var dirtySum = parentObj.registerA - temp_var - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (temp_var & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = parentObj.unsbtub(dirtySum);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//RST 0x18
	//#0xDF:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x18;
	},
	//LDH (n), A
	//#0xE0:
	function (parentObj) {
		parentObj.memoryWrite(0xFF00 + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter), parentObj.registerA);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//POP HL
	//#0xE1:
	function (parentObj) {
		parentObj.registersHL = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
	},
	//LD (C), A
	//#0xE2:
	function (parentObj) {
		parentObj.memoryWrite(0xFF00 + parentObj.registerC, parentObj.registerA);
	},
	//0xE3 - Illegal
	//#0xE3:
	function (parentObj) {
		cout("Illegal op code 0xE3 called, pausing emulation.", 2);
		pause();
	},
	//0xE4 - Illegal
	//#0xE4:
	function (parentObj) {
		cout("Illegal op code 0xE4 called, pausing emulation.", 2);
		pause();
	},
	//PUSH HL
	//#0xE5:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.registersHL >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.registersHL & 0xFF);
	},
	//AND n
	//#0xE6:
	function (parentObj) {
		parentObj.registerA &= parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = parentObj.FCarry = false;
	},
	//RST 0x20
	//#0xE7:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x20;
	},
	//ADD SP, n
	//#0xE8:
	function (parentObj) {
		var signedByte = parentObj.usbtsb(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter));
		var temp_value = (parentObj.stackPointer + signedByte) & 0xFFFF;
		parentObj.FCarry = (((parentObj.stackPointer ^ signedByte ^ temp_value) & 0x100) == 0x100);
		parentObj.FHalfCarry = (((parentObj.stackPointer ^ signedByte ^ temp_value) & 0x10) == 0x10);
		parentObj.stackPointer = temp_value;
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FZero = parentObj.FSubtract = false;
	},
	//JP, (HL)
	//#0xE9:
	function (parentObj) {
		parentObj.programCounter = parentObj.registersHL;
	},
	//LD n, A
	//#0xEA:
	function (parentObj) {
		parentObj.memoryWrite((parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter), parentObj.registerA);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//0xEB - Illegal
	//#0xEB:
	function (parentObj) {
		cout("Illegal op code 0xEB called, pausing emulation.", 2);
		pause();
	},
	//0xEC - Illegal
	//#0xEC:
	function (parentObj) {
		cout("Illegal op code 0xEC called, pausing emulation.", 2);
		pause();
	},
	//0xED - Illegal
	//#0xED:
	function (parentObj) {
		cout("Illegal op code 0xED called, pausing emulation.", 2);
		pause();
	},
	//XOR n
	//#0xEE:
	function (parentObj) {
		parentObj.registerA ^= parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//RST 0x28
	//#0xEF:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x28;
	},
	//LDH A, (n)
	//#0xF0:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryRead(0xFF00 + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter));
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//POP AF
	//#0xF1:
	function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.FZero = ((temp_var & 0x80) == 0x80);
		parentObj.FSubtract = ((temp_var & 0x40) == 0x40);
		parentObj.FHalfCarry = ((temp_var & 0x20) == 0x20);
		parentObj.FCarry = ((temp_var & 0x10) == 0x10);
		parentObj.registerA = parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
	},
	//LD A, (C)
	//#0xF2:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryRead(0xFF00 + parentObj.registerC);
	},
	//DI
	//#0xF3:
	function (parentObj) {
		parentObj.IME = false;
		parentObj.untilEnable = 0;
	},
	//0xF4 - Illegal
	//#0xF4:
	function (parentObj) {
		cout("Illegal op code 0xF4 called, pausing emulation.", 2);
		pause();
	},
	//PUSH AF
	//#0xF5:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.registerA);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, ((parentObj.FZero) ? 0x80 : 0) + ((parentObj.FSubtract) ? 0x40 : 0) + ((parentObj.FHalfCarry) ? 0x20 : 0) + ((parentObj.FCarry) ? 0x10 : 0));
	},
	//OR n
	//#0xF6:
	function (parentObj) {
		parentObj.registerA |= parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FSubtract = parentObj.FCarry = parentObj.FHalfCarry = false;
	},
	//RST 0x30
	//#0xF7:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x30;
	},
	//LDHL SP, n
	//#0xF8:
	function (parentObj) {
		var signedByte = parentObj.usbtsb(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter));
		parentObj.registersHL = (parentObj.stackPointer + signedByte) & 0xFFFF;
		parentObj.FCarry = (((parentObj.stackPointer ^ signedByte ^ parentObj.registersHL) & 0x100) == 0x100);
		parentObj.FHalfCarry = (((parentObj.stackPointer ^ signedByte ^ parentObj.registersHL) & 0x10) == 0x10);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FZero = parentObj.FSubtract = false;
	},
	//LD SP, HL
	//#0xF9:
	function (parentObj) {
		parentObj.stackPointer = parentObj.registersHL;
	},
	//LD A, (nn)
	//#0xFA:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryRead((parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter));
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//EI
	//#0xFB:
	function (parentObj) {
		parentObj.untilEnable = 2;
	},
	//0xFC - Illegal
	//#0xFC:
	function (parentObj) {
		cout("Illegal op code 0xFC called, pausing emulation.", 2);
		pause();
	},
	//0xFD - Illegal
	//#0xFD:
	function (parentObj) {
		cout("Illegal op code 0xFD called, pausing emulation.", 2);
		pause();
	},
	//CP n
	//#0xFE:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.FHalfCarry = (parentObj.unsbtub(dirtySum) & 0xF) > (parentObj.registerA & 0xF);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FSubtract = true;
	},
	//RST 0x38
	//#0xFF:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWrite(parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x38;
	}
);
GameBoyCore.prototype.CBOPCODE = new Array(
	//#0x00:
	function (parentObj) {
		parentObj.FCarry = ((parentObj.registerB & 0x80) == 0x80);
		parentObj.registerB = ((parentObj.registerB << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//#0x01:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerC & 0x80) == 0x80);
		parentObj.registerC = ((parentObj.registerC << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//#0x02:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerD & 0x80) == 0x80);
		parentObj.registerD = ((parentObj.registerD << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//#0x03:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerE & 0x80) == 0x80);
		parentObj.registerE = ((parentObj.registerE << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//#0x04:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x8000) == 0x8000);
		parentObj.registersHL = ((parentObj.registersHL << 1) & 0xFE00) + ((parentObj.FCarry) ? 0x100 : 0) + (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL <= 0xFF);
	}
	//#0x05:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x80) == 0x80);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + ((parentObj.registersHL << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0x00);
	}
	//#0x06:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = ((temp_var & 0x80) == 0x80);
		temp_var = ((temp_var << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0x00);
	}
	//#0x07:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x80) == 0x80);
		parentObj.registerA = ((parentObj.registerA << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0x00);
	}
	//#0x08:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerB & 0x01) == 0x01);
		parentObj.registerB = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerB >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//#0x09:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerC & 0x01) == 0x01);
		parentObj.registerC = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerC >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//#0x0A:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerD & 0x01) == 0x01);
		parentObj.registerD = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerD >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//#0x0B:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerE & 0x01) == 0x01);
		parentObj.registerE = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerE >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//#0x0C:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0100) == 0x0100);
		parentObj.registersHL = ((parentObj.FCarry) ? 0x8000 : 0) + ((parentObj.registersHL >> 1) & 0xFF00) + (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL <= 0xFF);
	}
	//#0x0D:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x01) == 0x01);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + ((parentObj.FCarry) ? 0x80 : 0) + ((parentObj.registersHL & 0xFF) >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0x00);
	}
	//#0x0E:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = ((temp_var & 0x01) == 0x01);
		temp_var = ((parentObj.FCarry) ? 0x80 : 0) + (temp_var >> 1);
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0x00);
	}
	//#0x0F:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x01) == 0x01);
		parentObj.registerA = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerA >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0x00);
	}
	//#0x10:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerB & 0x80) == 0x80);
		parentObj.registerB = ((parentObj.registerB << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//#0x11:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerC & 0x80) == 0x80);
		parentObj.registerC = ((parentObj.registerC << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//#0x12:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerD & 0x80) == 0x80);
		parentObj.registerD = ((parentObj.registerD << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//#0x13:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerE & 0x80) == 0x80);
		parentObj.registerE = ((parentObj.registerE << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//#0x14:
	,function (parentObj) {
		var newFCarry = ((parentObj.registersHL & 0x8000) == 0x8000);
		parentObj.registersHL = ((parentObj.registersHL << 1) & 0xFE00) + ((parentObj.FCarry) ? 0x100 : 0) + (parentObj.registersHL & 0xFF);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL <= 0xFF);
	}
	//#0x15:
	,function (parentObj) {
		var newFCarry = ((parentObj.registersHL & 0x80) == 0x80);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + ((parentObj.registersHL << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0x00);
	}
	//#0x16:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		var newFCarry = ((temp_var & 0x80) == 0x80);
		temp_var = ((temp_var << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0x00);
	}
	//#0x17:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerA & 0x80) == 0x80);
		parentObj.registerA = ((parentObj.registerA << 1) & 0xFF) + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0x00);
	}
	//#0x18:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerB & 0x01) == 0x01);
		parentObj.registerB = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerB >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//#0x19:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerC & 0x01) == 0x01);
		parentObj.registerC = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerC >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//#0x1A:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerD & 0x01) == 0x01);
		parentObj.registerD = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerD >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//#0x1B:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerE & 0x01) == 0x01);
		parentObj.registerE = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerE >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//#0x1C:
	,function (parentObj) {
		var newFCarry = ((parentObj.registersHL & 0x0100) == 0x0100);
		parentObj.registersHL = ((parentObj.FCarry) ? 0x8000 : 0) + ((parentObj.registersHL >> 1) & 0xFF00) + (parentObj.registersHL & 0xFF);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL <= 0xFF);
	}
	//#0x1D:
	,function (parentObj) {
		var newFCarry = ((parentObj.registersHL & 0x01) == 0x01);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + ((parentObj.FCarry) ? 0x80 : 0) + ((parentObj.registersHL & 0xFF) >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0x00);
	}
	//#0x1E:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		var newFCarry = ((temp_var & 0x01) == 0x01);
		temp_var = ((parentObj.FCarry) ? 0x80 : 0) + (temp_var >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0x00);
	}
	//#0x1F:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerA & 0x01) == 0x01);
		parentObj.registerA = ((parentObj.FCarry) ? 0x80 : 0) + (parentObj.registerA >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0x00);
	}
	//#0x20:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerB & 0x80) == 0x80);
		parentObj.registerB = (parentObj.registerB << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//#0x21:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerC & 0x80) == 0x80);
		parentObj.registerC = (parentObj.registerC << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//#0x22:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerD & 0x80) == 0x80);
		parentObj.registerD = (parentObj.registerD << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//#0x23:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerE & 0x80) == 0x80);
		parentObj.registerE = (parentObj.registerE << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//#0x24:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x8000) == 0x8000);
		parentObj.registersHL = ((parentObj.registersHL << 1) & 0xFE00) + (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL <= 0xFF);
	}
	//#0x25:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0080) == 0x0080);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + ((parentObj.registersHL << 1) & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0x00);
	}
	//#0x26:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = ((temp_var & 0x80) == 0x80);
		temp_var = (temp_var << 1) & 0xFF;
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0x00);
	}
	//#0x27:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x80) == 0x80);
		parentObj.registerA = (parentObj.registerA << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0x00);
	}
	//#0x28:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerB & 0x01) == 0x01);
		parentObj.registerB = (parentObj.registerB & 0x80) + (parentObj.registerB >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//#0x29:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerC & 0x01) == 0x01);
		parentObj.registerC = (parentObj.registerC & 0x80) + (parentObj.registerC >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//#0x2A:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerD & 0x01) == 0x01);
		parentObj.registerD = (parentObj.registerD & 0x80) + (parentObj.registerD >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//#0x2B:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerE & 0x01) == 0x01);
		parentObj.registerE = (parentObj.registerE & 0x80) + (parentObj.registerE >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//#0x2C:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0100) == 0x0100);
		parentObj.registersHL = ((parentObj.registersHL >> 1) & 0xFF00) + (parentObj.registersHL & 0x80FF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL <= 0xFF);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0001) == 0x0001);
		parentObj.registersHL = (parentObj.registersHL & 0xFF80) + ((parentObj.registersHL & 0xFF) >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0x00);
	}
	//#0x:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = ((temp_var & 0x01) == 0x01);
		temp_var = (temp_var & 0x80) + (temp_var >> 1);
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0x00);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x01) == 0x01);
		parentObj.registerA = (parentObj.registerA & 0x80) + (parentObj.registerA >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0x00);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB = ((parentObj.registerB & 0xF) << 4) + (parentObj.registerB >> 4);
		parentObj.FZero = (parentObj.registerB == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC = ((parentObj.registerC & 0xF) << 4) + (parentObj.registerC >> 4);
		parentObj.FZero = (parentObj.registerC == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD = ((parentObj.registerD & 0xF) << 4) + (parentObj.registerD >> 4);
		parentObj.FZero = (parentObj.registerD == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE = ((parentObj.registerE & 0xF) << 4) + (parentObj.registerE >> 4);
		parentObj.FZero = (parentObj.registerE == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL = ((parentObj.registersHL & 0xF00) << 4) + ((parentObj.registersHL & 0xF000) >> 4) + (parentObj.registersHL & 0xFF);
		parentObj.FZero = (parentObj.registersHL <= 0xFF);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + ((parentObj.registersHL & 0xF) << 4) + ((parentObj.registersHL & 0xF0) >> 4);
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//#0x:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		temp_var = ((temp_var & 0xF) << 4) + (temp_var >> 4);
		parentObj.memoryWrite(parentObj.registersHL, temp_var);
		parentObj.FZero = (temp_var == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA = ((parentObj.registerA & 0xF) << 4) + (parentObj.registerA >> 4);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerB & 0x01) == 0x01);
		parentObj.registerB >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerC & 0x01) == 0x01);
		parentObj.registerC >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerD & 0x01) == 0x01);
		parentObj.registerD >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerE & 0x01) == 0x01);
		parentObj.registerE >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0100) == 0x0100);
		parentObj.registersHL = ((parentObj.registersHL >> 1) & 0xFF00) + (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL <= 0xFF);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0001) == 0x0001);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) + ((parentObj.registersHL & 0xFF) >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0x00);
	}
	//#0x:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = ((temp_var & 0x01) == 0x01);
		parentObj.memoryWrite(parentObj.registersHL, temp_var >>= 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0x00);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x01) == 0x01);
		parentObj.registerA >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0x00);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x01) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x01) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x01) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x01) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0100) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0001) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x01) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x01) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x02) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x02) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x02) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x02) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0200) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0002) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x02) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x02) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x04) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x04) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x04) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x04) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0400) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0004) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x04) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x04) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x08) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x08) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x08) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x08) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0800) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0008) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x08) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x08) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x10) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x10) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x10) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x10) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x1000) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0010) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x10) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x10) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x20) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x20) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x20) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x20) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x2000) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0020) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x20) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x20) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x40) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x40) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x40) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x40) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x4000) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0040) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x40) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x40) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x80) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x80) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x80) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x80) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x8000) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0080) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x80) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x80) == 0);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB &= 0xFE;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC &= 0xFE;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD &= 0xFE;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE &= 0xFE;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFEFF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFFE;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xFE);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA &= 0xFE;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB &= 0xFD;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC &= 0xFD;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD &= 0xFD;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE &= 0xFD;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFDFF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFFD;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xFD);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA &= 0xFD;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB &= 0xFB;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC &= 0xFB;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD &= 0xFB;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE &= 0xFB;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFBFF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFFB;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xFB);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA &= 0xFB;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB &= 0xF7;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC &= 0xF7;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD &= 0xF7;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE &= 0xF7;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xF7FF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFF7;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xF7);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA &= 0xF7;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB &= 0xEF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC &= 0xEF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD &= 0xEF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE &= 0xEF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xEFFF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFEF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xEF);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA &= 0xEF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB &= 0xDF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC &= 0xDF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD &= 0xDF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE &= 0xDF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xDFFF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFDF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xDF);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA &= 0xDF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB &= 0xBF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC &= 0xBF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD &= 0xBF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE &= 0xBF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xBFFF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFBF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xBF);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA &= 0xBF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB &= 0x7F;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC &= 0x7F;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD &= 0x7F;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE &= 0x7F;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0x7FFF;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL &= 0xFF7F;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x7F);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA &= 0x7F;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB |= 0x01;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC |= 0x01;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD |= 0x01;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE |= 0x01;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x0100;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x01;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x01);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA |= 0x01;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB |= 0x02;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC |= 0x02;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD |= 0x02;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE |= 0x02;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x0200;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x02;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x02);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA |= 0x02;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB |= 0x04;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC |= 0x04;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD |= 0x04;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE |= 0x04;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x0400;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x04;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x04);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA |= 0x04;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB |= 0x08;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC |= 0x08;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD |= 0x08;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE |= 0x08;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x0800;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x08;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x08);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA |= 0x08;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB |= 0x10;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC |= 0x10;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD |= 0x10;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE |= 0x10;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x1000;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x10;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x10);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA |= 0x10;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB |= 0x20;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC |= 0x20;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD |= 0x20;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE |= 0x20;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x2000;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x20;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x20);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA |= 0x20;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB |= 0x40;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC |= 0x40;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD |= 0x40;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE |= 0x40;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x4000;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x40;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x40);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA |= 0x40;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerB |= 0x80;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerC |= 0x80;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerD |= 0x80;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerE |= 0x80;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x8000;
	}
	//#0x:
	,function (parentObj) {
		parentObj.registersHL |= 0x80;
	}
	//#0x:
	,function (parentObj) {
		parentObj.memoryWrite(parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x80);
	}
	//#0x:
	,function (parentObj) {
		parentObj.registerA |= 0x80;
	}
);
GameBoyCore.prototype.TICKTable = new Array(				//Number of machine cycles for each instruction:
/*	0, 1, 2, 3, 4, 5, 6, 7,		8, 9, A, B, C, D, E, F*/
	1, 3, 2, 2, 1, 1, 2, 1,		5, 2, 2, 2, 1, 1, 2, 1,  //0
	1, 3, 2, 2, 1, 1, 2, 1,		3, 2, 2, 2, 1, 1, 2, 1,  //1
	2, 3, 2, 2, 1, 1, 2, 1,		2, 2, 2, 2, 1, 1, 2, 1,  //2
	2, 3, 2, 2, 3, 3, 3, 1,		2, 2, 2, 2, 1, 1, 2, 1,  //3

	1, 1, 1, 1, 1, 1, 2, 1,		1, 1, 1, 1, 1, 1, 2, 1,  //4
	1, 1, 1, 1, 1, 1, 2, 1,		1, 1, 1, 1, 1, 1, 2, 1,  //5
	1, 1, 1, 1, 1, 1, 2, 1,		1, 1, 1, 1, 1, 1, 2, 1,  //6
	2, 2, 2, 2, 2, 2, 1, 2,		1, 1, 1, 1, 1, 1, 2, 1,  //7

	1, 1, 1, 1, 1, 1, 2, 1,		1, 1, 1, 1, 1, 1, 2, 1,  //8
	1, 1, 1, 1, 1, 1, 2, 1,		1, 1, 1, 1, 1, 1, 2, 1,  //9
	1, 1, 1, 1, 1, 1, 2, 1,		1, 1, 1, 1, 1, 1, 2, 1,  //A
	1, 1, 1, 1, 1, 1, 2, 1,		1, 1, 1, 1, 1, 1, 2, 1,  //B

	2, 3, 3, 4, 3, 4, 2, 4,		2, 4, 3, 2, 3, 6, 2, 4,  //C
	2, 3, 3, 1, 3, 4, 2, 4,		2, 4, 3, 1, 3, 1, 2, 4,  //D
	3, 3, 2, 1, 1, 4, 2, 4,		4, 1, 4, 1, 1, 1, 2, 4,  //E
	3, 3, 2, 1, 1, 4, 2, 4,		3, 2, 4, 1, 0, 1, 2, 4   //F
);
GameBoyCore.prototype.SecondaryTICKTable = new Array(		//Number of machine cycles for each 0xCBXX instruction:
/*	0, 1, 2, 3, 4, 5, 6, 7,		8, 9, A, B, C, D, E, F*/
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //0
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //1
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //2
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //3

	2, 2, 2, 2, 2, 2, 3, 2,		2, 2, 2, 2, 2, 2, 3, 2,  //4
	2, 2, 2, 2, 2, 2, 3, 2,		2, 2, 2, 2, 2, 2, 3, 2,  //5
	2, 2, 2, 2, 2, 2, 3, 2,		2, 2, 2, 2, 2, 2, 3, 2,  //6
	2, 2, 2, 2, 2, 2, 3, 2,		2, 2, 2, 2, 2, 2, 3, 2,  //7

	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //8
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //9
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //A
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //B

	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //C
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //D
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2,  //E
	2, 2, 2, 2, 2, 2, 4, 2,		2, 2, 2, 2, 2, 2, 4, 2   //F
);
GameBoyCore.prototype.saveState = function () {
	return [
		this.fromTypedArray(this.ROM),
		this.inBootstrap,
		this.registerA,
		this.FZero,
		this.FSubtract,
		this.FHalfCarry,
		this.FCarry,
		this.registerB,
		this.registerC,
		this.registerD,
		this.registerE,
		this.registersHL,
		this.stackPointer,
		this.programCounter,
		this.halt,
		this.IME,
		this.hdmaRunning,
		this.CPUTicks,
		this.multiplier,
		this.fromTypedArray(this.memory),
		this.fromTypedArray(this.MBCRam),
		this.fromTypedArray(this.VRAM),
		this.currVRAMBank,
		this.fromTypedArray(this.GBCMemory),
		this.MBC1Mode,
		this.MBCRAMBanksEnabled,
		this.currMBCRAMBank,
		this.currMBCRAMBankPosition,
		this.cGBC,
		this.gbcRamBank,
		this.gbcRamBankPosition,
		this.ROMBank1offs,
		this.currentROMBank,
		this.cartridgeType,
		this.name,
		this.gameCode,
		this.modeSTAT,
		this.LYCMatchTriggerSTAT,
		this.mode2TriggerSTAT,
		this.mode1TriggerSTAT,
		this.mode0TriggerSTAT,
		this.LCDisOn,
		this.gfxWindowY,
		this.gfxWindowDisplay,
		this.gfxSpriteShow,
		this.gfxSpriteDouble,
		this.gfxBackgroundY,
		this.gfxBackgroundX,
		this.TIMAEnabled,
		this.DIVTicks,
		this.LCDTicks,
		this.timerTicks,
		this.TACClocker,
		this.untilEnable,
		this.lastIteration,
		this.cMBC1,
		this.cMBC2,
		this.cMBC3,
		this.cMBC5,
		this.cSRAM,
		this.cMMMO1,
		this.cRUMBLE,
		this.cCamera,
		this.cTAMA5,
		this.cHuC3,
		this.cHuC1,
		this.drewBlank,
		this.tileData.slice(0),
		this.fromTypedArray(this.frameBuffer),
		this.tileCount,
		this.colorCount,
		this.gbPalette,
		this.gbcRawPalette,
		this.gbcPalette,
		this.transparentCutoff,
		this.bgEnabled,
		this.spritePriorityEnabled,
		this.fromTypedArray(this.tileReadState),
		this.windowSourceLine,
		this.channel1adjustedFrequencyPrep,
		this.channel1lastSampleLookup,
		this.channel1adjustedDuty,
		this.channel1totalLength,
		this.channel1envelopeVolume,
		this.channel1currentVolume,
		this.channel1envelopeType,
		this.channel1envelopeSweeps,
		this.channel1consecutive,
		this.channel1frequency,
		this.channel1volumeEnvTime,
		this.channel1lastTotalLength,
		this.channel1timeSweep,
		this.channel1lastTimeSweep,
		this.channel1numSweep,
		this.channel1frequencySweepDivider,
		this.channel1decreaseSweep,
		this.channel2adjustedFrequencyPrep,
		this.channel2lastSampleLookup,
		this.channel2adjustedDuty,
		this.channel2totalLength,
		this.channel2envelopeVolume,
		this.channel2currentVolume,
		this.channel2envelopeType,
		this.channel2envelopeSweeps,
		this.channel2consecutive,
		this.channel2frequency,
		this.channel2volumeEnvTime,
		this.channel2lastTotalLength,
		this.channel3canPlay,
		this.channel3totalLength,
		this.channel3lastTotalLength,
		this.channel3patternType,
		this.channel3frequency,
		this.channel3consecutive,
		this.channel3PCM,
		this.channel3adjustedFrequencyPrep,
		this.channel4adjustedFrequencyPrep,
		this.channel4lastSampleLookup,
		this.channel4totalLength,
		this.channel4envelopeVolume,
		this.channel4currentVolume,
		this.channel4envelopeType,
		this.channel4envelopeSweeps,
		this.channel4consecutive,
		this.channel4volumeEnvTime,
		this.channel4lastTotalLength,
		this.soundMasterEnabled,
		this.VinLeftChannelEnabled,
		this.VinRightChannelEnabled,
		this.VinLeftChannelMasterVolume,
		this.VinRightChannelMasterVolume,
		this.vinLeft,
		this.vinRight,
		this.leftChannel,
		this.rightChannel,
		this.actualScanLine,
		this.RTCisLatched,
		this.latchedSeconds,
		this.latchedMinutes,
		this.latchedHours,
		this.latchedLDays,
		this.latchedHDays,
		this.RTCSeconds,
		this.RTCMinutes,
		this.RTCHours,
		this.RTCDays,
		this.RTCDayOverFlow,
		this.RTCHALT,
		this.gbColorizedPalette,
		this.usedBootROM,
		this.skipPCIncrement,
		this.STATTracker,
		this.gbcRamBankPositionECHO,
		this.numRAMBanks
	];
}
GameBoyCore.prototype.returnFromState = function (returnedFrom) {
	var index = 0;
	var state = returnedFrom.slice(0);
	this.ROM = this.toTypedArray(state[index++], false, false);
	this.inBootstrap = state[index++];
	this.registerA = state[index++];
	this.FZero = state[index++];
	this.FSubtract = state[index++];
	this.FHalfCarry = state[index++];
	this.FCarry = state[index++];
	this.registerB = state[index++];
	this.registerC = state[index++];
	this.registerD = state[index++];
	this.registerE = state[index++];
	this.registersHL = state[index++];
	this.stackPointer = state[index++];
	this.programCounter = state[index++];
	this.halt = state[index++];
	this.IME = state[index++];
	this.hdmaRunning = state[index++];
	this.CPUTicks = state[index++];
	this.multiplier = state[index++];
	this.memory = this.toTypedArray(state[index++], false, false);
	this.MBCRam = this.toTypedArray(state[index++], false, false);
	this.VRAM = this.toTypedArray(state[index++], false, false);
	this.currVRAMBank = state[index++];
	this.GBCMemory = this.toTypedArray(state[index++], false, false);
	this.MBC1Mode = state[index++];
	this.MBCRAMBanksEnabled = state[index++];
	this.currMBCRAMBank = state[index++];
	this.currMBCRAMBankPosition = state[index++];
	this.cGBC = state[index++];
	this.gbcRamBank = state[index++];
	this.gbcRamBankPosition = state[index++];
	this.ROMBank1offs = state[index++];
	this.currentROMBank = state[index++];
	this.cartridgeType = state[index++];
	this.name = state[index++];
	this.gameCode = state[index++];
	this.modeSTAT = state[index++];
	this.LYCMatchTriggerSTAT = state[index++];
	this.mode2TriggerSTAT = state[index++];
	this.mode1TriggerSTAT = state[index++];
	this.mode0TriggerSTAT = state[index++];
	this.LCDisOn = state[index++];
	this.gfxWindowY = state[index++];
	this.gfxWindowDisplay = state[index++];
	this.gfxSpriteShow = state[index++];
	this.gfxSpriteDouble = state[index++];
	this.gfxBackgroundY = state[index++];
	this.gfxBackgroundX = state[index++];
	this.TIMAEnabled = state[index++];
	this.DIVTicks = state[index++];
	this.LCDTicks = state[index++];
	this.timerTicks = state[index++];
	this.TACClocker = state[index++];
	this.untilEnable = state[index++];
	this.lastIteration = state[index++];
	this.cMBC1 = state[index++];
	this.cMBC2 = state[index++];
	this.cMBC3 = state[index++];
	this.cMBC5 = state[index++];
	this.cSRAM = state[index++];
	this.cMMMO1 = state[index++];
	this.cRUMBLE = state[index++];
	this.cCamera = state[index++];
	this.cTAMA5 = state[index++];
	this.cHuC3 = state[index++];
	this.cHuC1 = state[index++];
	this.drewBlank = state[index++];
	this.tileData = state[index++];
	this.frameBuffer = this.toTypedArray(state[index++], true, false);
	this.tileCount = state[index++];
	this.colorCount = state[index++];
	this.gbPalette = state[index++];
	this.gbcRawPalette = state[index++];
	this.gbcPalette = state[index++];
	this.transparentCutoff = state[index++];
	this.bgEnabled = state[index++];
	this.spritePriorityEnabled = state[index++];
	this.tileReadState = this.toTypedArray(state[index++], false, false);
	this.windowSourceLine = state[index++];
	this.channel1adjustedFrequencyPrep = state[index++];
	this.channel1lastSampleLookup = state[index++];
	this.channel1adjustedDuty = state[index++];
	this.channel1totalLength = state[index++];
	this.channel1envelopeVolume = state[index++];
	this.channel1currentVolume = state[index++];
	this.channel1envelopeType = state[index++];
	this.channel1envelopeSweeps = state[index++];
	this.channel1consecutive = state[index++];
	this.channel1frequency = state[index++];
	this.channel1volumeEnvTime = state[index++];
	this.channel1lastTotalLength = state[index++];
	this.channel1timeSweep = state[index++];
	this.channel1lastTimeSweep = state[index++];
	this.channel1numSweep = state[index++];
	this.channel1frequencySweepDivider = state[index++];
	this.channel1decreaseSweep = state[index++];
	this.channel2adjustedFrequencyPrep = state[index++];
	this.channel2lastSampleLookup = state[index++];
	this.channel2adjustedDuty = state[index++];
	this.channel2totalLength = state[index++];
	this.channel2envelopeVolume = state[index++];
	this.channel2currentVolume = state[index++];
	this.channel2envelopeType = state[index++];
	this.channel2envelopeSweeps = state[index++];
	this.channel2consecutive = state[index++];
	this.channel2frequency = state[index++];
	this.channel2volumeEnvTime = state[index++];
	this.channel2lastTotalLength = state[index++];
	this.channel3canPlay = state[index++];
	this.channel3totalLength = state[index++];
	this.channel3lastTotalLength = state[index++];
	this.channel3patternType = state[index++];
	this.channel3frequency = state[index++];
	this.channel3consecutive = state[index++];
	this.channel3PCM = state[index++];
	this.channel3adjustedFrequencyPrep = state[index++];
	this.channel4adjustedFrequencyPrep = state[index++];
	this.channel4lastSampleLookup = state[index++];
	this.channel4totalLength = state[index++];
	this.channel4envelopeVolume = state[index++];
	this.channel4currentVolume = state[index++];
	this.channel4envelopeType = state[index++];
	this.channel4envelopeSweeps = state[index++];
	this.channel4consecutive = state[index++];
	this.channel4volumeEnvTime = state[index++];
	this.channel4lastTotalLength = state[index++];
	this.soundMasterEnabled = state[index++];
	this.VinLeftChannelEnabled = state[index++];
	this.VinRightChannelEnabled = state[index++];
	this.VinLeftChannelMasterVolume = state[index++];
	this.VinRightChannelMasterVolume = state[index++];
	this.vinLeft = state[index++];
	this.vinRight = state[index++];
	this.leftChannel = state[index++];
	this.rightChannel = state[index++];
	this.actualScanLine = state[index++];
	this.RTCisLatched = state[index++];
	this.latchedSeconds = state[index++];
	this.latchedMinutes = state[index++];
	this.latchedHours = state[index++];
	this.latchedLDays = state[index++];
	this.latchedHDays = state[index++];
	this.RTCSeconds = state[index++];
	this.RTCMinutes = state[index++];
	this.RTCHours = state[index++];
	this.RTCDays = state[index++];
	this.RTCDayOverFlow = state[index++];
	this.RTCHALT = state[index++];
	this.gbColorizedPalette = state[index++];
	this.usedBootROM = state[index++];
	this.skipPCIncrement = state[index++];
	this.STATTracker = state[index++];
	this.gbcRamBankPositionECHO = state[index++];
	this.numRAMBanks = state[index];
	this.tileCountInvalidator = this.tileCount * 4;
	this.fromSaveState = true;
	this.checkPaletteType();
	this.convertAuxilliary();
	this.initializeLCDController();
	this.memoryReadJumpCompile();
	this.memoryWriteJumpCompile();
	this.initLCD();
	this.initSound();
	this.drawToCanvas();
}
GameBoyCore.prototype.start = function () {
	settings[4] = 0;	//Reset the frame skip setting.
	this.initializeLCDController();	//Compile the LCD controller functions.
	this.initMemory();	//Write the startup memory.
	this.ROMLoad();		//Load the ROM into memory and get cartridge information from it.
	this.initLCD();		//Initialize the graphics.
	this.initSound();	//Sound object initialization.
	this.run();			//Start the emulation.
}
GameBoyCore.prototype.convertAuxilliary = function () {
	try {
		this.DAATable = new Uint16Array(this.DAATable);
		this.TICKTable = new Uint8Array(this.TICKTable);
		this.SecondaryTICKTable = new Uint8Array(this.SecondaryTICKTable);
	}
	catch (error) {
		cout("Could not convert the auxilliary arrays to typed arrays (Error \"" + error.message + "\").", 1);
	}
}
GameBoyCore.prototype.initMemory = function () {
	//Initialize the RAM:
	this.memory = this.getTypedArray(0x10000, 0, "uint8");
	this.frameBuffer = this.getTypedArray(23040, 0x00FFFFFF, "int32");
	this.gbPalette = this.ArrayPad(12, 0);				//32-bit signed
	this.gbColorizedPalette = this.ArrayPad(12, 0);		//32-bit signed
	this.gbcRawPalette = this.ArrayPad(0x80, -1000);	//32-bit signed
	this.gbcPalette = new Array(0x40);					//32-bit signed
	this.convertAuxilliary();
	//Initialize the GBC Palette:
	var index = 0x3F;
	while (index >= 0) {
		this.gbcPalette[index] = (index < 0x20) ? -1 : 0;
		index--;
	}
}
GameBoyCore.prototype.initSkipBootstrap = function () {
	//Start as an unset device:
	cout("Starting without the GBC boot ROM.", 0);
	this.programCounter = 0x100;
	this.stackPointer = 0xFFFE;
	this.IME = true;
	this.LCDTicks = 15;
	this.DIVTicks = 14;
	this.registerA = (this.cGBC) ? 0x11 : 0x1;
	this.registerB = 0;
	this.registerC = 0x13;
	this.registerD = 0;
	this.registerE = 0xD8;
	this.FZero = true;
	this.FSubtract = false;
	this.FHalfCarry = true;
	this.FCarry = true;
	this.registersHL = 0x014D;
	this.leftChannel = this.ArrayPad(4, true);
	this.rightChannel = this.ArrayPad(4, true);
	//Fill in the boot ROM set register values
	//Default values to the GB boot ROM values, then fill in the GBC boot ROM values after ROM loading
	var index = 0xFF;
	while (index >= 0) {
		if (index >= 0x30 && index < 0x40) {
			this.memoryWrite(0xFF00 + index, this.ffxxDump[index]);
		}
		else {
			switch (index) {
				case 0x00:
				case 0x01:
				case 0x02:
				case 0x07:
				case 0x0F:
				case 0x40:
				case 0xFF:
					this.memoryWrite(0xFF00 + index, this.ffxxDump[index]);
					break;
				default:
					this.memory[0xFF00 + index] = this.ffxxDump[index];
			}
		}
		index--;
	}
}
GameBoyCore.prototype.initBootstrap = function () {
	//Start as an unset device:
	cout("Starting the GBC boot ROM.", 0);
	this.programCounter = 0;
	this.stackPointer = 0;
	this.IME = false;
	this.LCDTicks = 0;
	this.DIVTicks = 0;
	this.registerA = 0;
	this.registerB = 0;
	this.registerC = 0;
	this.registerD = 0;
	this.registerE = 0;
	this.FZero = this.FSubtract = this.FHalfCarry = this.FCarry = false;
	this.registersHL = 0;
	this.leftChannel = this.ArrayPad(4, false);
	this.rightChannel = this.ArrayPad(4, false);
	this.channel2frequency = this.channel1frequency = 0;
	this.channel2volumeEnvTime = this.channel1volumeEnvTime = 0;
	this.channel2consecutive = this.channel1consecutive = true;
	this.memory[0xFF00] = 0xF;	//Set the joypad state.
}
GameBoyCore.prototype.ROMLoad = function () {
	//Load the first two ROM banks (0x0000 - 0x7FFF) into regular gameboy memory:
	this.ROM = this.getTypedArray(this.ROMImage.length, 0, "uint8");
	this.usedBootROM = settings[16];
	for (var romIndex = 0; romIndex < this.ROMImage.length; romIndex++) {
		this.ROM[romIndex] = (this.ROMImage.charCodeAt(romIndex) & 0xFF);
		if (romIndex < 0x8000) {
			if (!this.usedBootROM || romIndex >= 0x900 || (romIndex >= 0x100 && romIndex < 0x200)) {
				this.memory[romIndex] = this.ROM[romIndex];		//Load in the game ROM.
			}
			else {
				this.memory[romIndex] = this.GBCBOOTROM[romIndex];	//Load in the GameBoy Color BOOT ROM.
			}
		}
	}
	// ROM name
	for (var index = 0x134; index < 0x13F; index++) {
		if (this.ROMImage.charCodeAt(index) > 0) {
			this.name += this.ROMImage[index];
		}
	}
	// ROM game code (for newer games)
	for (var index = 0x13F; index < 0x143; index++) {
		if (this.ROMImage.charCodeAt(index) > 0) {
			this.gameCode += this.ROMImage[index];
		}
	}
	cout("Game Title: " + this.name + "[" + this.gameCode + "][" + this.ROMImage[0x143] + "]", 0);
	cout("Game Code: " + this.gameCode, 0);
	// Cartridge type
	this.cartridgeType = this.ROM[0x147];
	cout("Cartridge type #" + this.cartridgeType, 0);
	//Map out ROM cartridge sub-types.
	var MBCType = "";
	switch (this.cartridgeType) {
		case 0x00:
			//ROM w/o bank switching
			if (!settings[9]) {
				MBCType = "ROM";
				break;
			}
		case 0x01:
			this.cMBC1 = true;
			MBCType = "MBC1";
			break;
		case 0x02:
			this.cMBC1 = true;
			this.cSRAM = true;
			MBCType = "MBC1 + SRAM";
			break;
		case 0x03:
			this.cMBC1 = true;
			this.cSRAM = true;
			this.cBATT = true;
			MBCType = "MBC1 + SRAM + BATT";
			break;
		case 0x05:
			this.cMBC2 = true;
			MBCType = "MBC2";
			break;
		case 0x06:
			this.cMBC2 = true;
			this.cBATT = true;
			MBCType = "MBC2 + BATT";
			break;
		case 0x08:
			this.cSRAM = true;
			MBCType = "ROM + SRAM";
			break;
		case 0x09:
			this.cSRAM = true;
			this.cBATT = true;
			MBCType = "ROM + SRAM + BATT";
			break;
		case 0x0B:
			this.cMMMO1 = true;
			MBCType = "MMMO1";
			break;
		case 0x0C:
			this.cMMMO1 = true;
			this.cSRAM = true;
			MBCType = "MMMO1 + SRAM";
			break;
		case 0x0D:
			this.cMMMO1 = true;
			this.cSRAM = true;
			this.cBATT = true;
			MBCType = "MMMO1 + SRAM + BATT";
			break;
		case 0x0F:
			this.cMBC3 = true;
			this.cTIMER = true;
			this.cBATT = true;
			MBCType = "MBC3 + TIMER + BATT";
			break;
		case 0x10:
			this.cMBC3 = true;
			this.cTIMER = true;
			this.cBATT = true;
			this.cSRAM = true;
			MBCType = "MBC3 + TIMER + BATT + SRAM";
			break;
		case 0x11:
			this.cMBC3 = true;
			MBCType = "MBC3";
			break;
		case 0x12:
			this.cMBC3 = true;
			this.cSRAM = true;
			MBCType = "MBC3 + SRAM";
			break;
		case 0x13:
			this.cMBC3 = true;
			this.cSRAM = true;
			this.cBATT = true;
			MBCType = "MBC3 + SRAM + BATT";
			break;
		case 0x19:
			this.cMBC5 = true;
			MBCType = "MBC5";
			break;
		case 0x1A:
			this.cMBC5 = true;
			this.cSRAM = true;
			MBCType = "MBC5 + SRAM";
			break;
		case 0x1B:
			this.cMBC5 = true;
			this.cSRAM = true;
			this.cBATT = true;
			MBCType = "MBC5 + SRAM + BATT";
			break;
		case 0x1C:
			this.cRUMBLE = true;
			MBCType = "RUMBLE";
			break;
		case 0x1D:
			this.cRUMBLE = true;
			this.cSRAM = true;
			MBCType = "RUMBLE + SRAM";
			break;
		case 0x1E:
			this.cRUMBLE = true;
			this.cSRAM = true;
			this.cBATT = true;
			MBCType = "RUMBLE + SRAM + BATT";
			break;
		case 0x1F:
			this.cCamera = true;
			MBCType = "GameBoy Camera";
			break;
		case 0xFD:
			this.cTAMA5 = true;
			MBCType = "TAMA5";
			break;
		case 0xFE:
			this.cHuC3 = true;
			MBCType = "HuC3";
			break;
		case 0xFF:
			this.cHuC1 = true;
			MBCType = "HuC1";
			break;
		default:
			MBCType = "Unknown";
			cout("Cartridge type is unknown.", 2);
			pause();
	}
	cout("Cartridge Type: " + MBCType + ".", 0);
	// ROM and RAM banks
	this.numROMBanks = this.ROMBanks[this.ROM[0x148]];
	cout(this.numROMBanks + " ROM banks.", 0);
	switch (this.RAMBanks[this.ROM[0x149]]) {
		case 0:
			cout("No RAM banking requested for allocation or MBC is of type 2.", 0);
			break;
		case 2:
			cout("1 RAM bank requested for allocation.", 0);
			break;
		case 3:
			cout("4 RAM banks requested for allocation.", 0);
			break;
		case 4:
			cout("16 RAM banks requested for allocation.", 0);
			break;
		default:
			cout("RAM bank amount requested is unknown, will use maximum allowed by specified MBC type.", 0);
	}
	//Check the GB/GBC mode byte:
	if (!this.usedBootROM) {
		switch (this.ROM[0x143]) {
			case 0x00:	//Only GB mode
				this.cGBC = false;
				cout("Only GB mode detected.", 0);
				break;
			case 0x80:	//Both GB + GBC modes
				this.cGBC = !settings[2];
				cout("GB and GBC mode detected.", 0);
				break;
			case 0xC0:	//Only GBC mode
				this.cGBC = true;
				cout("Only GBC mode detected.", 0);
				break;
			default:
				this.cGBC = false;
				cout("Unknown GameBoy game type code #" + this.ROM[0x143] + ", defaulting to GB mode (Old games don't have a type code).", 1);
		}
		this.inBootstrap = false;
		this.setupRAM();	//CPU/(V)RAM initialization.
		this.initSkipBootstrap();
	}
	else {
		this.cGBC = true;	//Allow the GBC boot ROM to run in GBC mode...
		this.setupRAM();	//CPU/(V)RAM initialization.
		this.initBootstrap();
	}
	this.checkPaletteType();
	//License Code Lookup:
	var cOldLicense = this.ROM[0x14B];
	var cNewLicense = (this.ROM[0x144] & 0xFF00) | (this.ROM[0x145] & 0xFF);
	if (cOldLicense != 0x33) {
		//Old Style License Header
		cout("Old style license code: " + cOldLicense, 0);
	}
	else {
		//New Style License Header
		cout("New style license code: " + cNewLicense, 0);
	}
}
GameBoyCore.prototype.disableBootROM = function () {
	//Remove any traces of the boot ROM from ROM memory.
	for (var index = 0; index < 0x900; index++) {
		if (index < 0x100 || index >= 0x200) {		//Skip the already loaded in ROM header.
			this.memory[index] = this.ROM[index];	//Replace the GameBoy Color boot ROM with the game ROM.
		}
	}
	this.checkPaletteType();
	if (!this.cGBC) {
		//Clean up the post-boot (GB mode only) state:
		cout("Stepping down from GBC mode.", 0);
		this.tileCount /= 2;
		this.tileCountInvalidator = this.tileCount * 4;
		if (!settings[17]) {
			this.transparentCutoff = 4;
		}
		this.colorCount = 12;
		this.tileData.length = this.tileCount * this.colorCount;
		delete this.VRAM;
		delete this.GBCMemory;
		//Possible Extra: shorten some gfx arrays to the length that we need (Remove the unused indices)
	}
	this.memoryReadJumpCompile();
	this.memoryWriteJumpCompile();
}
GameBoyCore.prototype.setupRAM = function () {
	//Setup the auxilliary/switchable RAM to their maximum possible size (Bad headers can lie).
	if (this.cMBC2) {
		this.numRAMBanks = 1 / 16;
	}
	else if (this.cMBC1 || this.cRUMBLE || this.cMBC3 || this.cHuC3) {
		this.numRAMBanks = 4;
	}
	else if (this.cMBC5) {
		this.numRAMBanks = 16;
	}
	else if (this.cSRAM) {
		this.numRAMBanks = 1;
	}
	if (this.numRAMBanks > 0) {
		if (!this.MBCRAMUtilized()) {
			//For ROM and unknown MBC cartridges using the external RAM:
			this.MBCRAMBanksEnabled = true;
		}
		//Switched RAM Used
		this.MBCRam = this.getTypedArray(this.numRAMBanks * 0x2000, 0, "uint8");
	}
	cout("Actual bytes of MBC RAM allocated: " + (this.numRAMBanks * 0x2000), 0);
	//Setup the RAM for GBC mode.
	if (this.cGBC) {
		this.VRAM = this.getTypedArray(0x2000, 0, "uint8");
		this.GBCMemory = this.getTypedArray(0x7000, 0, "uint8");
		this.tileCount *= 2;
		this.tileCountInvalidator = this.tileCount * 4;
		this.colorCount = 64;
		this.transparentCutoff = 32;
	}
	this.tileData = this.ArrayPad(this.tileCount * this.colorCount, null);
	this.tileReadState = this.getTypedArray(this.tileCount, 0, "uint8");
	this.memoryReadJumpCompile();
	this.memoryWriteJumpCompile();
}
GameBoyCore.prototype.MBCRAMUtilized = function () {
	return this.cMBC1 || this.cMBC2 || this.cMBC3 || this.cMBC5 || this.cRUMBLE;
}
GameBoyCore.prototype.initLCD = function () {
	this.scaledFrameBuffer = this.getTypedArray(this.pixelCount, 0, "int32");	//Used for software side scaling...
	this.transparentCutoff = (settings[17] || this.cGBC) ? 32 : 4;
	if (this.weaveLookup.length == 0) {
		//Setup the image decoding lookup table:
		this.weaveLookup = this.getTypedArray(256, 0, "uint16");
		for (var i_ = 0x1; i_ <= 0xFF; i_++) {
			for (var d_ = 0; d_ < 0x8; d_++) {
				this.weaveLookup[i_] += ((i_ >> d_) & 1) << (d_ * 2);
			}
		}
	}
	try {
		if (settings[5]) {
			//Nasty since we are throwing on purpose to force a try/catch fallback
			throw(new Error(""));
		}
		//Create a white screen
		this.drawContext = this.canvas.getContext("2d");
		//Get a CanvasPixelArray buffer:
		try {
			this.canvasBuffer = this.drawContext.createImageData(this.width, this.height);
		}
		catch (error) {
			cout("Falling back to the getImageData initialization (Error \"" + error.message + "\").", 1);
			this.canvasBuffer = this.drawContext.getImageData(0, 0, this.width, this.height);
		}
		var index = this.pixelCount;
		var index2 = this.rgbCount;
		while (index > 0) {
			this.frameBuffer[--index] = 0x00FFFFFF;
			this.canvasBuffer.data[index2 -= 4] = 0xFF;
			this.canvasBuffer.data[index2 + 1] = 0xFF;
			this.canvasBuffer.data[index2 + 2] = 0xFF;
			this.canvasBuffer.data[index2 + 3] = 0xFF;
		}
		this.drawContext.putImageData(this.canvasBuffer, 0, 0);		//Throws any browser that won't support this later on.
		this.canvasAlt.style.visibility = "hidden";	//Make sure, if restarted, that the fallback images aren't going cover the canvas.
		this.canvas.style.visibility = "visible";
		this.canvasFallbackHappened = false;
	}
	catch (error) {
		//Falling back to an experimental data URI BMP file canvas alternative:
		cout("Falling back to BMP imaging as a canvas alternative.", 1);
		this.width = 160;
		this.height = 144;
		this.canvasFallbackHappened = true;
		this.drawContext = new BMPCanvas(this.canvasAlt, 160, 144, settings[6][0], settings[6][1]);
		this.canvasBuffer = new Object();
		var index = 23040;
		while (index > 0) {
			this.frameBuffer[--index] = 0x00FFFFFF;
		}
		this.canvasBuffer.data = this.ArrayPad(92160, 0xFF);
		this.drawContext.putImageData(this.canvasBuffer, 0, 0);
		//Make visible only after the images have been initialized.
		this.canvasAlt.style.visibility = "visible";
		this.canvas.style.visibility = "hidden";			//Speedier layout in some browsers.
	}
}
GameBoyCore.prototype.JoyPadEvent = function (key, down) {
	if (down) {
		this.JoyPad &= 0xFF ^ (1 << key);
		/*if (!this.cGBC) {
			this.memory[0xFF0F] |= 0x10;	//A real GBC doesn't set this!
		}*/
	}
	else {
		this.JoyPad |= (1 << key);
	}
	this.memory[0xFF00] = (this.memory[0xFF00] & 0x30) + ((((this.memory[0xFF00] & 0x20) == 0) ? (this.JoyPad >> 4) : 0xF) & (((this.memory[0xFF00] & 0x10) == 0) ? (this.JoyPad & 0xF) : 0xF));
}
GameBoyCore.prototype.initSound = function () {
	if (settings[0]) {
		try {
			//mozAudio - Synchronous Audio API
			this.audioHandle = new Audio();
			this.audioHandle.mozSetup((!settings[1]) ? 2 : 1, settings[14]);
			cout("Mozilla Audio API Initialized:", 0);
			this.audioType = 0;
		}
		catch (error) {
			try {
				if (typeof audioContextHandle == "undefined") {									//Make sure we don't try to create more than one audio context.
					/*Get the one continuous audio loop rolling, as the loop will update
					the audio asynchronously by inspecting the gameboy object periodically.
					Variables and event handling functions have to be globally declared to prevent a bad bug in an experimental Safari build!*/
					audioContextHandle = new AudioContext();									//Create a system audio context.
					audioSource = audioContextHandle.createBufferSource();						//We need to create a false input to get the chain started.
					audioSource.loop = true;	//Keep this alive forever (Event handler will know when to ouput.)
					audioSource.buffer = audioContextHandle.createBuffer(1, 1, settings[14]);	//Create a zero'd input buffer for the input to be valid.
					audioNode = audioContextHandle.createJavaScriptNode(settings[18], 1, 2);	//Create 2 outputs and ignore the input buffer (Just copy buffer 1 over if mono)
					audioNode.onaudioprocess = audioOutputEvent;								//Connect the audio processing event to a handling function so we can manipulate output
					audioSource.connect(audioNode);												//Send and chain the input to the audio manipulation.
					audioNode.connect(audioContextHandle.destination);							//Send and chain the output of the audio manipulation to the system audio output.
					audioSource.noteOn(0);														//Start the loop!
				}
				cout("WebKit Audio API Initialized:", 0);
				this.audioType = 1;
			}
			catch (error) {
				try {
					this.audioHandle = new AudioThread((!settings[1]) ? 2 : 1, settings[14], settings[15], false);
					cout("WAV PCM Audio Wrapper Initialized:", 0);
					this.audioType = 2;
					this.outTrackerLimit = 20 * (settings[14] / 44100);
					
				}
				catch (error) {
					settings[0] = false;
					this.audioType = -1;
					cout("Audio system cannot run: " + error.message, 2);
				}
			}
		}
		if (settings[0]) {
			cout("...Audio Channels: " + ((!settings[1]) ? 2 : 1), 0);
			cout("...Sample Rate: " + settings[14], 0);
			this.initAudioBuffer();
		}
	}
}
GameBoyCore.prototype.initAudioBuffer = function () {
	this.audioIndex = 0;
	this.sampleSize = Math.floor(settings[14] / 1000 * settings[20]) + 1;
	cout("...Samples Per VBlank (Per Channel): " + this.sampleSize, 0);
	this.samplesOut = this.sampleSize / (settings[11] * Math.ceil(settings[13] / settings[11]));
	cout("...Samples Per machine cycle (Per Channel): " + this.samplesOut, 0);
	this.numSamplesTotal = (settings[1]) ? this.sampleSize : (this.sampleSize * 2);
	this.audioSamples = this.getTypedArray(this.numSamplesTotal, 0, "float32");
	this.audioBackup = this.getTypedArray(this.numSamplesTotal, 0, "float32");
	this.smallNoiseTable = this.getTypedArray(0x80, 0, "float32");
	this.largeNoiseTable = this.getTypedArray(0x8000, 0, "float32");
	//var shiftValue = 0;
	//var smallNoiseTable = new Array(0x80);
	//7-bit white noise table:
	//smallNoiseTable[0] = 0x7F;	//Seed value
	//this.smallNoiseTable[0] = 1;
	for (var index = 0; index < 0x80; index++) {
		/*shiftValue = smallNoiseTable[index - 1] >> 1;
		smallNoiseTable[index] = (((shiftValue ^ smallNoiseTable[index - 1]) & 1) << 6) | shiftValue;*/
		//this.smallNoiseTable[index] = (smallNoiseTable[index] / 0x7F);
		this.smallNoiseTable[index] = Math.random();
	}
	//15-bit white noise table:
	//var largeNoiseTable = new Array(0x8000);
	//largeNoiseTable[0] = 0x7FFF;	//Seed value
	//this.largeNoiseTable[0] = 1;
	for (var index = 0; index < 0x8000; index++) {
		/*shiftValue = largeNoiseTable[index - 1] >> 1;
		largeNoiseTable[index] = (((shiftValue ^ largeNoiseTable[index - 1]) & 1) << 14) | shiftValue;*/
		//this.largeNoiseTable[index] = largeNoiseTable[index] / 0x7FFF;
		this.largeNoiseTable[index] = Math.random();
	}
	this.noiseTableLookup = this.largeNoiseTable;
}
GameBoyCore.prototype.playAudio = function () {
	if (settings[0]) {
		if (!this.audioOverflow && this.audioIndex < this.numSamplesTotal) {
			//Make sure we don't under-run the sample generation:
			this.generateAudio((this.numSamplesTotal - this.audioIndex) / ((!settings[1]) ? 2 : 1));
		}
		if (this.audioType == 0) {
			//mozAudio
			this.audioHandle.mozWriteAudio((this.audioOverflow != this.usingBackupAsMain) ? this.audioBackup : this.audioSamples);
		}
		else if (this.audioType == 2) {
			//WAV PCM via Data URI
			this.audioHandle = (this.outTracker++ > 0) ? this.audioHandle : new AudioThread((!settings[1]) ? 2 : 1, settings[14], settings[15], false);
			this.audioHandle.appendBatch((this.audioOverflow != this.usingBackupAsMain) ? this.audioBackup : this.audioSamples);
		}
	}
}
GameBoyCore.prototype.audioUpdate = function () {
	if (settings[0]) {
		if (this.audioType == 2 && this.outTracker > this.outTrackerLimit) {
			try {
				this.audioHandle.outputAudio();
				this.outTracker = 0;
			}
			catch (error) {
				settings[0] = false;
				cout("Audio system cannot run: " + error.message, 2);
			}
		}
		this.audioOverflow = false;
	}
}
GameBoyCore.prototype.initializeAudioStartState = function () {
	this.channel1adjustedFrequencyPrep = 0;
	this.channel1lastSampleLookup = 0;
	this.channel1adjustedDuty = 0.5;
	this.channel1totalLength = 0;
	this.channel1envelopeVolume = 0;
	this.channel1currentVolume = 0;
	this.channel1envelopeType = false;
	this.channel1envelopeSweeps = 0;
	this.channel1consecutive = true;
	this.channel1frequency = 0;
	this.channel1volumeEnvTime = 0;
	this.channel1lastTotalLength = 0;
	this.channel1timeSweep = 0;
	this.channel1lastTimeSweep = 0;
	this.channel1numSweep = 0;
	this.channel1frequencySweepDivider = 0;
	this.channel1decreaseSweep = false;
	this.channel2adjustedFrequencyPrep = 0;
	this.channel2lastSampleLookup = 0;
	this.channel2adjustedDuty = 0.5;
	this.channel2totalLength = 0;
	this.channel2envelopeVolume = 0;
	this.channel2currentVolume = 0;
	this.channel2envelopeType = false;
	this.channel2envelopeSweeps = 0;
	this.channel2consecutive = true;
	this.channel2frequency = 0;
	this.channel2volumeEnvTime = 0;
	this.channel2lastTotalLength = 0;
	this.channel3canPlay = false;
	this.channel3totalLength = 0;
	this.channel3lastTotalLength = 0;
	this.channel3patternType = -20;
	this.channel3frequency = 0;
	this.channel3consecutive = true;
	this.channel3PCM = this.getTypedArray(0x60, 0xF, "float32");
	this.channel3adjustedFrequencyPrep = 0x20000 / settings[14];
	this.channel4adjustedFrequencyPrep = 0;
	this.channel4lastSampleLookup = 0;				//Keeps track of the audio timing.
	this.channel4totalLength = 0;
	this.channel4envelopeVolume = 0;
	this.channel4currentVolume = 0;
	this.channel4envelopeType = false;
	this.channel4envelopeSweeps = 0;
	this.channel4consecutive = true;
	this.channel4volumeEnvTime = 0;
	this.channel4lastTotalLength = 0;	
}
GameBoyCore.prototype.generateAudio = function (numSamples) {
	if (settings[0]) {
		if (this.soundMasterEnabled) {
			if (settings[1]) {						//Split Mono & Stereo into two, to avoid this if statement every iteration of the loop.
				while (--numSamples >= 0) {			//Leave as while for TraceMonkey JS engine (do while seems to be just a tad slower in tracing) (Method JIT implementations still faster though)
					//MONO
					this.channel1Compute();
					this.channel2Compute();
					this.channel3Compute();
					this.channel4Compute();
					this.currentBuffer[this.audioIndex++] = /*this.vinLeft * */this.currentSampleLeft / Math.max(this.channelLeftCount, 1);
					if (this.audioIndex == this.numSamplesTotal) {
						this.audioIndex = 0;
						if (this.usingBackupAsMain) {
							this.currentBuffer = this.audioSamples;
							this.usingBackupAsMain = false;
						}
						else {
							this.currentBuffer = this.audioBackup;
							this.usingBackupAsMain = true;
						}
						this.audioOverflow = true;
					}
				}
			}
			else {
				while (--numSamples >= 0) {		//Leave as while for TraceMonkey JS engine (do while seems to be just a tad slower in tracing) (Method JIT implementations still faster though)
					//STEREO
					this.channel1Compute();
					this.channel2Compute();
					this.channel3Compute();
					this.channel4Compute();
					this.currentBuffer[this.audioIndex++] = /*this.vinRight * */this.currentSampleRight / Math.max(this.channelRightCount, 1);
					this.currentBuffer[this.audioIndex++] = /*this.vinLeft * */this.currentSampleLeft / Math.max(this.channelLeftCount, 1);
					if (this.audioIndex == this.numSamplesTotal) {
						this.audioIndex = 0;
						if (this.usingBackupAsMain) {
							this.currentBuffer = this.audioSamples;
							this.usingBackupAsMain = false;
						}
						else {
							this.currentBuffer = this.audioBackup;
							this.usingBackupAsMain = true;
						}
						this.audioOverflow = true;
					}
				}
			}
		}
		else {
			//SILENT OUTPUT:
			if (settings[1]) {
				while (--numSamples >= 0) {
					//MONO
					this.currentBuffer[this.audioIndex++] = 0;
					if (this.audioIndex == this.numSamplesTotal) {
						this.audioIndex = 0;
						if (this.usingBackupAsMain) {
							this.currentBuffer = this.audioSamples;
							this.usingBackupAsMain = false;
						}
						else {
							this.currentBuffer = this.audioBackup;
							this.usingBackupAsMain = true;
						}
						this.audioOverflow = true;
					}
				}
			}
			else {
				while (--numSamples >= 0) {
					//STEREO
					this.currentBuffer[this.audioIndex++] = this.currentBuffer[this.audioIndex++] = 0;
					if (this.audioIndex == this.numSamplesTotal) {
						this.audioIndex = 0;
						if (this.usingBackupAsMain) {
							this.currentBuffer = this.audioSamples;
							this.usingBackupAsMain = false;
						}
						else {
							this.currentBuffer = this.audioBackup;
							this.usingBackupAsMain = true;
						}
						this.audioOverflow = true;
					}
				}
			}
		}
	}
}
GameBoyCore.prototype.channel1Compute = function () {
	if ((this.channel1consecutive || this.channel1totalLength > 0) && this.channel1frequency <= 0x7FF) {
		var duty = (this.channel1lastSampleLookup <= this.channel1adjustedDuty) ? this.channel1currentVolume : 0;
		if (this.leftChannel[0]) {
			this.currentSampleLeft = duty;
			this.channelLeftCount = 1;
		}
		else {
			this.channelLeftCount = this.currentSampleLeft = 0;
		}
		if (this.rightChannel[0]) {
			this.currentSampleRight = duty;
			this.channelRightCount = 1;
		}
		else {
			this.channelRightCount = this.currentSampleRight = 0;
		}
		if (this.channel1numSweep > 0) {
			if (--this.channel1timeSweep == 0) {
				this.channel1numSweep--;
				if (this.channel1decreaseSweep) {
					this.channel1frequency -= this.channel1frequency / this.channel1frequencySweepDivider;
				}
				else {
					this.channel1frequency += this.channel1frequency / this.channel1frequencySweepDivider;
					if (this.channel1frequency > 0x7FF) {
						this.memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
					}
				}
				this.channel1timeSweep = this.channel1lastTimeSweep;
				//Pre-calculate the frequency computation outside the waveform generator for speed:
				this.channel1adjustedFrequencyPrep = this.preChewedAudioComputationMultiplier / (0x800 - this.channel1frequency);
			}
		}
		if (this.channel1envelopeSweeps > 0) {
			if (this.channel1volumeEnvTime > 0) {
				this.channel1volumeEnvTime--;
			}
			else {
				if (!this.channel1envelopeType) {
					if (this.channel1envelopeVolume > 0) {
						this.channel1currentVolume = --this.channel1envelopeVolume / 0xF;
						this.channel1volumeEnvTime = this.channel1envelopeSweeps * this.volumeEnvelopePreMultiplier;
					}
				}
				else {
					if (this.channel1envelopeVolume < 0xF) {
						this.channel1currentVolume = ++this.channel1envelopeVolume / 0xF;
						this.channel1volumeEnvTime = this.channel1envelopeSweeps * this.volumeEnvelopePreMultiplier;
					}
				}
			}
		}
		if (this.channel1totalLength > 0) {
			this.channel1totalLength--;
			if (this.channel1totalLength <= 0) {
				this.memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
			}
		}
		this.channel1lastSampleLookup += this.channel1adjustedFrequencyPrep;
		while (this.channel1lastSampleLookup >= 1) {
			this.channel1lastSampleLookup -= 1;
		}
	}
	else {
		this.channelLeftCount = this.channelRightCount = this.currentSampleLeft = this.currentSampleRight = 0;
	}
}
GameBoyCore.prototype.channel2Compute = function () {
	if (this.channel2consecutive || this.channel2totalLength > 0) {
		var duty = (this.channel2lastSampleLookup <= this.channel2adjustedDuty) ? this.channel2currentVolume : 0;
		if (this.leftChannel[1]) {
			this.currentSampleLeft += duty;
			this.channelLeftCount++;
		}
		if (this.rightChannel[1]) {
			this.currentSampleRight += duty;
			this.channelRightCount++;
		}
		if (this.channel2envelopeSweeps > 0) {
			if (this.channel2volumeEnvTime > 0) {
				this.channel2volumeEnvTime--;
			}
			else {
				if (!this.channel2envelopeType) {
					if (this.channel2envelopeVolume > 0) {
						this.channel2currentVolume = --this.channel2envelopeVolume / 0xF;
						this.channel2volumeEnvTime = this.channel2envelopeSweeps * this.volumeEnvelopePreMultiplier;
					}
				}
				else {
					if (this.channel2envelopeVolume < 0xF) {
						this.channel2currentVolume = ++this.channel2envelopeVolume / 0xF;
						this.channel2volumeEnvTime = this.channel2envelopeSweeps * this.volumeEnvelopePreMultiplier;
					}
				}
			}
		}
		if (this.channel2totalLength > 0) {
			this.channel2totalLength--;
			if (this.channel2totalLength <= 0) {
				this.memory[0xFF26] &= 0xFD;	//Channel #2 On Flag Off
			}
		}
		this.channel2lastSampleLookup += this.channel2adjustedFrequencyPrep;
		while (this.channel2lastSampleLookup >= 1) {
			this.channel2lastSampleLookup -= 1;
		}
	}
}
GameBoyCore.prototype.channel3Compute = function () {
	if (this.channel3canPlay && (this.channel3consecutive || this.channel3totalLength > 0)) {
		if (this.channel3patternType > -20) {
			var PCMSample = this.channel3PCM[this.channel3Tracker | this.channel3patternType];
			if (this.leftChannel[2]) {
				this.currentSampleLeft += PCMSample;
				this.channelLeftCount++;
			}
			if (this.rightChannel[2]) {
				this.currentSampleRight += PCMSample;
				this.channelRightCount++;
			}
		}
		this.channel3Tracker += this.channel3adjustedFrequencyPrep;
		if (this.channel3Tracker >= 0x20) {
			this.channel3Tracker -= 0x20;
		}
		if (this.channel3totalLength > 0) {
			this.channel3totalLength--;
			if (this.channel3totalLength <= 0) {
				this.memory[0xFF26] &= 0xFB;	//Channel #3 On Flag Off
			}
		}
	}
}
GameBoyCore.prototype.channel4Compute = function () {
	if (this.channel4consecutive || this.channel4totalLength > 0) {
		var duty = this.channel4currentVolume * this.noiseTableLookup[this.channel4lastSampleLookup | 0];
		if (this.leftChannel[3]) {
			this.currentSampleLeft += duty;
			this.channelLeftCount++;
		}
		if (this.rightChannel[3]) {
			this.currentSampleRight += duty;
			this.channelRightCount++;
		}
		if (this.channel4envelopeSweeps > 0) {
			if (this.channel4volumeEnvTime > 0) {
				this.channel4volumeEnvTime--;
			}
			else {
				if (!this.channel4envelopeType) {
					if (this.channel4envelopeVolume > 0) {
						this.channel4currentVolume = --this.channel4envelopeVolume / 0xF;
						this.channel4volumeEnvTime = this.channel4envelopeSweeps * this.volumeEnvelopePreMultiplier;
					}
				}
				else {
					if (this.channel4envelopeVolume < 0xF) {
						this.channel4currentVolume = ++this.channel4envelopeVolume / 0xF;
						this.channel4volumeEnvTime = this.channel4envelopeSweeps * this.volumeEnvelopePreMultiplier;
					}
				}
			}
		}
		if (this.channel4totalLength > 0) {
			this.channel4totalLength--;
			if (this.channel4totalLength <= 0) {
				this.memory[0xFF26] &= 0xF7;	//Channel #4 On Flag Off
			}
		}
		this.channel4lastSampleLookup += this.channel4adjustedFrequencyPrep;
		if (this.channel4lastSampleLookup >= this.noiseTableLookup.length) {
			this.channel4lastSampleLookup = 0;
		}
	}
}
GameBoyCore.prototype.run = function () {
	//The preprocessing before the actual iteration loop:
	try {
		if ((this.stopEmulator & 2) == 0) {
			if ((this.stopEmulator & 1) == 1) {
				this.stopEmulator = 0;
				this.clockUpdate();			//Frame skip and RTC code.
				this.audioUpdate();			//Lookup the rollover buffer and output WAVE PCM samples if sound is on and have fallen back to it.
				if (!this.halt) {			//If no HALT... Execute normally
					this.executeIteration();
				}
				else {						//If we bailed out of a halt because the iteration ran down its timing.
					this.CPUTicks = 1;
					this.OPCODE[0x76](this);
					//Execute Interrupt:
					this.runInterrupt();
					//Timing:
					this.updateCore();
					this.executeIteration();
				}
			}
			else {		//We can only get here if there was an internal error, but the loop was restarted.
				cout("Iterator restarted a faulted core.", 2);
				pause();
			}
		}
	}
	catch (error) {
		if (error.message != "HALT_OVERRUN") {
			cout("GameBoy runtime error: " + error.message + "; line: " + error.lineNumber, 2);
		}
	}
}
GameBoyCore.prototype.executeIteration = function () {
	//Iterate the interpreter loop:
	var op = 0;
	while (this.stopEmulator == 0) {
		//Fetch the current opcode.
		op = this.memoryRead(this.programCounter);
		if (!this.skipPCIncrement) {
			//Increment the program counter to the next instruction:
			this.programCounter = (this.programCounter + 1) & 0xFFFF;
		}
		this.skipPCIncrement = false;
		//Get how many CPU cycles the current op code counts for:
		this.CPUTicks = this.TICKTable[op];
		//Execute the OP code instruction:
		this.OPCODE[op](this);
		//Interrupt Arming:
		switch (this.untilEnable) {
			case 1:
				this.IME = true;
			case 2:
				this.untilEnable--;
		}
		//Execute Interrupt:
		if (this.IME) {
			this.runInterrupt();
		}
		//Timing:
		this.updateCore();
	}
}
GameBoyCore.prototype.runInterrupt = function () {
	var bitShift = 0;
	var testbit = 1;
	var interrupts = this.memory[0xFFFF] & this.memory[0xFF0F];
	while (bitShift < 5) {
		//Check to see if an interrupt is enabled AND requested.
		if ((testbit & interrupts) == testbit) {
			this.IME = false;					//Reset the interrupt enabling.
			this.memory[0xFF0F] -= testbit;		//Reset the interrupt request.
			//Set the stack pointer to the current program counter value:
			this.stackPointer = (this.stackPointer - 1) & 0xFFFF;
			this.memoryWrite(this.stackPointer, this.programCounter >> 8);
			this.stackPointer = (this.stackPointer - 1) & 0xFFFF;
			this.memoryWrite(this.stackPointer, this.programCounter & 0xFF);
			//Set the program counter to the interrupt's address:
			this.programCounter = 0x0040 + (bitShift * 0x08);
			//Interrupts have a certain clock cycle length:
			this.CPUTicks += 5;	//People say it's around 5.
			break;	//We only want the highest priority interrupt.
		}
		testbit = 1 << ++bitShift;
	}
}
GameBoyCore.prototype.scanLineMode2 = function () { // OAM in use
	if (this.modeSTAT != 2) {
		if (this.mode2TriggerSTAT) {
			this.memory[0xFF0F] |= 0x2;// set IF bit 1
		}
		this.STATTracker = 1;
		this.modeSTAT = 2;
	}
}
GameBoyCore.prototype.scanLineMode3 = function () { // OAM in use
	if (this.modeSTAT != 3) {
		if (this.mode2TriggerSTAT && this.STATTracker == 0) {
			this.memory[0xFF0F] |= 0x2;// set IF bit 1
		}
		this.STATTracker = 1;
		this.modeSTAT = 3;
	}
}
GameBoyCore.prototype.scanLineMode0 = function () { // H-Blank 
	if (this.modeSTAT != 0) {
		this.notifyScanline();
		if (this.hdmaRunning && !this.halt) {
			this.performHdma();	//H-Blank DMA
		}
		if (this.mode0TriggerSTAT || (this.mode2TriggerSTAT && this.STATTracker == 0)) {
			this.memory[0xFF0F] |= 0x2; // if STAT bit 3 -> set IF bit1
		}
		this.STATTracker = 2;
		this.modeSTAT = 0;
	}
}
GameBoyCore.prototype.matchLYC = function () { // LY - LYC Compare
	if (this.memory[0xFF44] == this.memory[0xFF45]) { // If LY==LCY
		this.memory[0xFF41] |= 0x04; // set STAT bit 2: LY-LYC coincidence flag
		if (this.LYCMatchTriggerSTAT) {
			this.memory[0xFF0F] |= 0x2; // set IF bit 1
		}
	} 
	else {
		this.memory[0xFF41] &= 0xFB; // reset STAT bit 2 (LY!=LYC)
	}
}
GameBoyCore.prototype.updateCore = function () {
	// DIV control
	this.DIVTicks += this.CPUTicks;
	if (this.DIVTicks >= 0x40) {
		this.DIVTicks -= 0x40;
		this.memory[0xFF04] = (this.memory[0xFF04] + 1) & 0xFF; // inc DIV
	}
	//LCD Controller Ticks
	var timedTicks = this.CPUTicks / this.multiplier;
	// LCD Timing
	this.LCDTicks += timedTicks;				//LCD timing
	this.LCDCONTROL[this.actualScanLine](this);	//Scan Line and STAT Mode Control 
	//Audio Timing
	this.audioTicks += timedTicks;				//Not the same as the LCD timing (Cannot be altered by display on/off changes!!!).
	if (this.audioTicks >= settings[11]) {		//Are we past the granularity setting?
		var amount = this.audioTicks * this.samplesOut;
		var actual = amount | 0;
		this.rollover += amount - actual;
		if (this.rollover >= 1) {
			this.rollover -= 1;
			actual += 1;
		}
		if (!this.audioOverflow && actual > 0) {
			this.generateAudio(actual);
		}
		//Emulator Timing (Timed against audio for optimization):
		this.emulatorTicks += this.audioTicks;
		if (this.emulatorTicks >= settings[13]) {
			this.playAudio();				//Output all the samples built up.
			if (this.drewBlank == 0) {		//LCD off takes at least 2 frames.
				this.drawToCanvas();		//Display frame
			}
			this.stopEmulator |= 1;			//End current loop.
			this.emulatorTicks = 0;
		}
		this.audioTicks = 0;
	}
	// Internal Timer
	if (this.TIMAEnabled) {
		this.timerTicks += this.CPUTicks;
		while (this.timerTicks >= this.TACClocker) {
			this.timerTicks -= this.TACClocker;
			if (this.memory[0xFF05] == 0xFF) {
				this.memory[0xFF05] = this.memory[0xFF06];
				this.memory[0xFF0F] |= 0x4; // set IF bit 2
			}
			else {
				this.memory[0xFF05]++;
			}
		}
	}
}
GameBoyCore.prototype.initializeLCDController = function () {
	//Display on hanlding:
	var line = 0;
	while (line < 154) {
		if (line < 143) {
			//We're on a normal scan line:
			this.LINECONTROL[line] = function (parentObj) {
				if (parentObj.LCDTicks < 20) {
					parentObj.scanLineMode2();	// mode2: 80 cycles
				}
				else if (parentObj.LCDTicks < 63) {
					parentObj.scanLineMode3();	// mode3: 172 cycles
				}
				else if (parentObj.LCDTicks < 114) {
					parentObj.scanLineMode0();	// mode0: 204 cycles
				}
				else {
					//We're on a new scan line:
					parentObj.LCDTicks -= 114;
					if (parentObj.STATTracker != 2) {
						parentObj.notifyScanline();
						if (parentObj.hdmaRunning && !parentObj.halt && parentObj.LCDisOn) {
							parentObj.performHdma();	//H-Blank DMA
						}
						if (parentObj.mode0TriggerSTAT) {
							parentObj.memory[0xFF0F] |= 0x2;// set IF bit 1
						}
					}
					parentObj.actualScanLine = ++parentObj.memory[0xFF44];
					parentObj.matchLYC();
					parentObj.STATTracker = 0;
					parentObj.scanLineMode2();	// mode2: 80 cycles
					if (parentObj.LCDTicks >= 114) {
						//We need to skip 1 or more scan lines:
						parentObj.notifyScanline();
						parentObj.LCDCONTROL[parentObj.actualScanLine](parentObj);	//Scan Line and STAT Mode Control 
					}
				}
			}
		}
		else if (line == 143) {
			//We're on the last visible scan line of the LCD screen:
			this.LINECONTROL[143] = function (parentObj) {
				if (parentObj.LCDTicks < 20) {
					parentObj.scanLineMode2();	// mode2: 80 cycles
				}
				else if (parentObj.LCDTicks < 63) {
					parentObj.scanLineMode3();	// mode3: 172 cycles
				}
				else if (parentObj.LCDTicks < 114) {
					parentObj.scanLineMode0();	// mode0: 204 cycles
				}
				else {
					//Starting V-Blank:
					//Just finished the last visible scan line:
					parentObj.LCDTicks -= 114;
					if (parentObj.mode1TriggerSTAT) {
						parentObj.memory[0xFF0F] |= 0x2;// set IF bit 1
					}
					if (parentObj.STATTracker != 2) {
						parentObj.notifyScanline();
						if (parentObj.hdmaRunning && !parentObj.halt && parentObj.LCDisOn) {
							parentObj.performHdma();	//H-Blank DMA
						}
						if (parentObj.mode0TriggerSTAT) {
							parentObj.memory[0xFF0F] |= 0x2;// set IF bit 1
						}
					}
					parentObj.actualScanLine = ++parentObj.memory[0xFF44];
					parentObj.matchLYC();
					parentObj.STATTracker = 0;
					parentObj.modeSTAT = 1;
					parentObj.memory[0xFF0F] |= 0x1; 	// set IF flag 0
					if (parentObj.drewBlank > 0) {		//LCD off takes at least 2 frames.
						parentObj.drewBlank--;
					}
					if (parentObj.LCDTicks >= 114) {
						//We need to skip 1 or more scan lines:
						parentObj.LCDCONTROL[parentObj.actualScanLine](parentObj);	//Scan Line and STAT Mode Control 
					}
				}
			}
		}
		else if (line < 153) {
			//In VBlank
			this.LINECONTROL[line] = function (parentObj) {
				if (parentObj.LCDTicks >= 114) {
					//We're on a new scan line:
					parentObj.LCDTicks -= 114;
					parentObj.actualScanLine = ++parentObj.memory[0xFF44];
					parentObj.matchLYC();
					if (parentObj.LCDTicks >= 114) {
						//We need to skip 1 or more scan lines:
						parentObj.LCDCONTROL[parentObj.actualScanLine](parentObj);	//Scan Line and STAT Mode Control 
					}
				}
			}
		}
		else {
			//VBlank Ending (We're on the last actual scan line)
			this.LINECONTROL[153] = function (parentObj) {
				if (parentObj.memory[0xFF44] == 153) {
					parentObj.memory[0xFF44] = 0;	//LY register resets to 0 early.
					parentObj.matchLYC();			//LY==LYC Test is early here (Fixes specific one-line glitches (example: Kirby2 intro)).
				}
				if (parentObj.LCDTicks >= 114) {
					//We reset back to the beginning:
					parentObj.LCDTicks -= 114;
					parentObj.actualScanLine = 0;
					parentObj.scanLineMode2();	// mode2: 80 cycles
					if (parentObj.LCDTicks >= 114) {
						//We need to skip 1 or more scan lines:
						parentObj.LCDCONTROL[parentObj.actualScanLine](parentObj);	//Scan Line and STAT Mode Control 
					}
				}
			}
		}
		line++;
	}
	this.LCDCONTROL = (this.LCDisOn) ? this.LINECONTROL : this.DISPLAYOFFCONTROL;
}
GameBoyCore.prototype.DisplayShowOff = function () {
	if (this.drewBlank == 0) {
		//Draw a blank screen:
		var index = this.rgbCount;
		while (index > 0) {
			this.canvasBuffer.data[--index] = 0xFF;
		}
		this.drawContext.putImageData(this.canvasBuffer, 0, 0);
		this.drewBlank = 2;
	}
}
GameBoyCore.prototype.performHdma = function () {
	this.CPUTicks += 1 + (8 * this.multiplier);
	var dmaSrc = (this.memory[0xFF51] << 8) + this.memory[0xFF52];
	var dmaDstRelative = (this.memory[0xFF53] << 8) + this.memory[0xFF54];
	var dmaDstFinal = dmaDstRelative + 0x10;
	var tileRelative = this.tileData.length - this.tileCount;
	if (this.currVRAMBank == 1) {
		while (dmaDstRelative < dmaDstFinal) {
			if (dmaDstRelative < 0x1800) {		// Bkg Tile data area
				var tileIndex = (dmaDstRelative >> 4) + 384;
				if (this.tileReadState[tileIndex] == 1) {
					var r = tileRelative + tileIndex;
					do {
						this.tileData[r] = null;
						r -= this.tileCount;
					} while (r >= 0);
					this.tileReadState[tileIndex] = 0;
				}
			}
			this.VRAM[dmaDstRelative++] = this.memoryRead(dmaSrc++);
		}
	}
	else {
		while (dmaDstRelative < dmaDstFinal) {
			if (dmaDstRelative < 0x1800) {		// Bkg Tile data area
				var tileIndex = dmaDstRelative >> 4;
				if (this.tileReadState[tileIndex] == 1) {
					var r = tileRelative + tileIndex;
					do {
						this.tileData[r] = null;
						r -= this.tileCount;
					} while (r >= 0);
					this.tileReadState[tileIndex] = 0;
				}
			}
			this.memory[0x8000 + dmaDstRelative++] = this.memoryRead(dmaSrc++);
		}
	}
	this.memory[0xFF51] = ((dmaSrc & 0xFF00) >> 8);
	this.memory[0xFF52] = (dmaSrc & 0x00F0);
	this.memory[0xFF53] = ((dmaDstFinal & 0x1F00) >> 8);
	this.memory[0xFF54] = (dmaDstFinal & 0x00F0);
	if (this.memory[0xFF55] == 0) {
		this.hdmaRunning = false;
		this.memory[0xFF55] = 0xFF;	//Transfer completed ("Hidden last step," since some ROMs don't imply this, but most do).
	}
	else {
		this.memory[0xFF55]--;
	}
}
GameBoyCore.prototype.clockUpdate = function () {
	//We're tying in the same timer for RTC and frame skipping, since we can and this reduces load.
	if (settings[7] || this.cTIMER) {
		var timeElapsed = new Date().getTime() - new Date(this.lastIteration).getTime();	//Get the numnber of milliseconds since this last executed.
		if (this.cTIMER && !this.RTCHALT) {
			//Update the MBC3 RTC:
			this.RTCSeconds += timeElapsed / 1000;
			while (this.RTCSeconds >= 60) {	//System can stutter, so the seconds difference can get large, thus the "while".
				this.RTCSeconds -= 60;
				this.RTCMinutes++;
				if (this.RTCMinutes >= 60) {
					this.RTCMinutes -= 60;
					this.RTCHours++;
					if (this.RTCHours >= 24) {
						this.RTCHours -= 24
						this.RTCDays++;
						if (this.RTCDays >= 512) {
							this.RTCDays -= 512;
							this.RTCDayOverFlow = true;
						}
					}
				}
			}
		}
		if (settings[7]) {
			//Auto Frame Skip:
			if (timeElapsed > settings[20]) {
				//Did not finish in time...
				if (settings[4] < settings[8]) {
					settings[4]++;
				}
			}
			else if (settings[4] > 0) {
				//We finished on time, decrease frame skipping (throttle to somewhere just below full speed)...
				settings[4]--;
			}
		}
		this.lastIteration = new Date().getTime();
	}
}
GameBoyCore.prototype.drawToCanvas = function () {
	//Draw the frame buffer to the canvas:
	if (settings[4] == 0 || this.frameCount > 0) {
		//Copy and convert the framebuffer data to the CanvasPixelArray format.
		var canvasData = this.canvasBuffer.data;
		var frameBuffer = (settings[21] && this.pixelCount > 0 && this.width != 160 && this.height != 144) ? this.resizeFrameBuffer() : this.frameBuffer;
		var bufferIndex = this.pixelCount;
		var canvasIndex = this.rgbCount;
		while (canvasIndex > 3) {
			canvasData[canvasIndex -= 4] = (frameBuffer[--bufferIndex] >> 16) & 0xFF;		//Red
			canvasData[canvasIndex + 1] = (frameBuffer[bufferIndex] >> 8) & 0xFF;			//Green
			canvasData[canvasIndex + 2] = frameBuffer[bufferIndex] & 0xFF;					//Blue
		}
		//Draw out the CanvasPixelArray data:
		this.drawContext.putImageData(this.canvasBuffer, 0, 0);
		if (settings[4] > 0) {
			//Increment the frameskip counter:
			this.frameCount -= settings[4];
		}
	}
	else {
		//Reset the frameskip counter:
		this.frameCount += settings[12];
	}
}
GameBoyCore.prototype.resizeFrameBuffer = function () {
	//Attempt to resize the canvas in software instead of in CSS:
	var column = 0;
	var rowOffset = 0;
	for (var row = 0; row < this.height; row++) {
		rowOffset = ((row * this.heightRatio) | 0) * 160;
		for (column = 0; column < this.width; column++) {
			this.scaledFrameBuffer[(row * this.width) + column] = this.frameBuffer[rowOffset + ((column * this.widthRatio) | 0)];
		}
	}
	return this.scaledFrameBuffer;
}
GameBoyCore.prototype.invalidateAll = function (pal) {
	var stop = (pal + 1) * this.tileCountInvalidator;
	for (var r = pal * this.tileCountInvalidator; r < stop; r++) {
		this.tileData[r] = null;
	}
}
GameBoyCore.prototype.setGBCPalettePre = function (index_, data) {
	if (this.gbcRawPalette[index_] == data) {
		return;
	}
	this.gbcRawPalette[index_] = data;
	if (index_ >= 0x40 && (index_ & 0x6) == 0) {
		// stay transparent
		return;
	}
	var value = (this.gbcRawPalette[index_ | 1] << 8) + this.gbcRawPalette[index_ & -2];
	this.gbcPalette[index_ >> 1] = 0x80000000 + ((value & 0x1F) << 19) + ((value & 0x3E0) << 6) + ((value & 0x7C00) >> 7);
	this.invalidateAll(index_ >> 3);
}
GameBoyCore.prototype.setGBCPalette = function (index_, data) {
	this.setGBCPalettePre(index_, data);
	if ((index_ & 0x6) == 0) {
		this.gbcPalette[index_ >> 1] &= 0x00FFFFFF;
	}
}
GameBoyCore.prototype.decodePalette = function (startIndex, data) {
	if (!this.cGBC) {
		this.gbPalette[startIndex] = this.colors[data & 0x03] & 0x00FFFFFF; // color 0: transparent
		this.gbPalette[startIndex + 1] = this.colors[(data >> 2) & 0x03];
		this.gbPalette[startIndex + 2] = this.colors[(data >> 4) & 0x03];
		this.gbPalette[startIndex + 3] = this.colors[data >> 6];
		if (this.usedBootROM) {	//Do palette conversions if we did the GBC bootup:
			//GB colorization:
			var startOffset = (startIndex >= 4) ? 0x20 : 0;
			var pal2 = this.gbcPalette[startOffset + ((data >> 2) & 0x03)];
			var pal3 = this.gbcPalette[startOffset + ((data >> 4) & 0x03)];
			var pal4 = this.gbcPalette[startOffset + (data >> 6)];
			this.gbColorizedPalette[startIndex] = this.gbcPalette[startOffset + (data & 0x03)] & 0x00FFFFFF;
			this.gbColorizedPalette[startIndex + 1] = (pal2 >= 0x80000000) ? pal2 : 0xFFFFFFFF;
			this.gbColorizedPalette[startIndex + 2] = (pal3 >= 0x80000000) ? pal3 : 0xFFFFFFFF;
			this.gbColorizedPalette[startIndex + 3] = (pal4 >= 0x80000000) ? pal4 : 0xFFFFFFFF;
		}
	}
}
GameBoyCore.prototype.notifyScanline = function () {
	//if (settings[4] == 0 || this.frameCount > 0) {
		if (this.actualScanLine == 0) {
			this.windowSourceLine = 0;
		}
		// determine the left edge of the window (160 if window is inactive)
		var windowLeft = (this.gfxWindowDisplay && this.memory[0xFF4A] <= this.actualScanLine) ? Math.min(160, this.memory[0xFF4B] - 7) : 160;
		// step 1: background+window
		var skippedAnything = this.drawBackgroundForLine(this.actualScanLine, windowLeft, 0);
		// At this point, the high (alpha) byte in the frameBuffer is 0xff for colors 1,2,3 and
		// 0x00 for color 0. Foreground sprites draw on all colors, background sprites draw on
		// top of color 0 only.
		// step 2: sprites
		this.drawSpritesForLine(this.actualScanLine);
		// step 3: prio tiles+window
		if (skippedAnything) {
			this.drawBackgroundForLine(this.actualScanLine, windowLeft, 0x80);
		}
		if (windowLeft < 160) {
			this.windowSourceLine++;
		}
	//}
}
GameBoyCore.prototype.drawBackgroundForLine = function (line, windowLeft, priority) {
	var skippedTile = false;
	var tileNum = 0, tileXCoord = 0, tileAttrib = 0;
	var sourceY = line + this.memory[0xFF42];
	var sourceImageLine = sourceY & 0x7;
	var tileX = this.memory[0xFF43] >> 3;
	var memStart = ((this.gfxBackgroundY) ? 0x1C00 : 0x1800) + ((sourceY & 0xF8) << 2);
	var screenX = -(this.memory[0xFF43] & 7);
	for (; screenX < windowLeft; tileX++, screenX += 8) {
		tileXCoord = (tileX & 0x1F);
		var baseaddr = this.memory[0x8000 + memStart + tileXCoord];
		tileNum = (this.gfxBackgroundX) ? baseaddr : ((baseaddr > 0x7F) ? ((baseaddr & 0x7F) + 0x80) : (baseaddr + 0x100));
		if (this.cGBC) {
			var mapAttrib = this.VRAM[memStart + tileXCoord];
			if ((mapAttrib & 0x80) != priority) {
				skippedTile = true;
				continue;
			}
			tileAttrib = ((mapAttrib & 0x07) << 2) + ((mapAttrib >> 5) & 0x03);
			tileNum += 384 * ((mapAttrib >> 3) & 0x01); // tile vram bank
		}
		this.drawPartCopy(tileNum, screenX, line, sourceImageLine, tileAttrib);
	}
	if (windowLeft < 160) {
		// window!
		var windowStartAddress = (this.gfxWindowY) ? 0x1C00 : 0x1800;
		var windowSourceTileY = this.windowSourceLine >> 3;
		var tileAddress = windowStartAddress + (windowSourceTileY * 0x20);
		var windowSourceTileLine = this.windowSourceLine & 0x7;
		for (screenX = windowLeft; screenX < 160; tileAddress++, screenX += 8) {
			var baseaddr = this.memory[0x8000 + tileAddress];
			tileNum = (this.gfxBackgroundX) ? baseaddr : ((baseaddr > 0x7F) ? ((baseaddr & 0x7F) + 0x80) : (baseaddr + 0x100));
			if (this.cGBC) {
				var mapAttrib = this.VRAM[tileAddress];
				if ((mapAttrib & 0x80) != priority) {
					skippedTile = true;
					continue;
				}
				tileAttrib = ((mapAttrib & 0x07) << 2) + ((mapAttrib >> 5) & 0x03); // mirroring
				tileNum += 384 * ((mapAttrib >> 3) & 0x01); // tile vram bank
			}
			this.drawPartCopy(tileNum, screenX, line, windowSourceTileLine, tileAttrib);
		}
	}
	return skippedTile;
}
GameBoyCore.prototype.drawPartCopy = function (tileIndex, x, y, sourceLine, attribs) {
	var image = this.tileData[tileIndex + this.tileCount * attribs] || this.updateImage(tileIndex, attribs);
	var dst = x + y * 160;
	var src = sourceLine * 8;
	var dstEnd = (x > 152) ? ((y + 1) * 160) : (dst + 8);  
	if (x < 0) { // adjust left
		dst -= x;
		src -= x;
	}
	while (dst < dstEnd) {
		this.frameBuffer[dst++] = image[src++];
	}
}
GameBoyCore.prototype.checkPaletteType = function () {
	//Reference the correct palette ahead of time...
	this.palette = (this.cGBC) ? this.gbcPalette : ((this.usedBootROM && settings[17]) ? this.gbColorizedPalette : this.gbPalette);
}
GameBoyCore.prototype.updateImage = function (tileIndex, attribs) {
	var index_ = tileIndex + this.tileCount * attribs;
	var otherBank = (tileIndex >= 384);
	var offset = otherBank ? ((tileIndex - 384) << 4) : (tileIndex << 4);
	var paletteStart = attribs & 0xFC;
	var transparent = attribs >= this.transparentCutoff;
	var pixix = 0;
	var pixixdx = 1;
	var pixixdy = 0;
	var tempPix = this.getTypedArray(64, 0, "int32");
	if ((attribs & 2) != 0) {
		pixixdy = -16;
		pixix = 56;
	}
	if ((attribs & 1) == 0) {
		pixixdx = -1;
		pixix += 7;
		pixixdy += 16;
	}
	for (var y = 8; --y >= 0;) {
		var num = this.weaveLookup[this.VRAMReadGFX(offset++, otherBank)] + (this.weaveLookup[this.VRAMReadGFX(offset++, otherBank)] << 1);
		if (num != 0) {
			transparent = false;
		}
		for (var x = 8; --x >= 0;) {
			tempPix[pixix] = this.palette[paletteStart + (num & 3)] & -1;
			pixix += pixixdx;
			num  >>= 2;
		}
		pixix += pixixdy;
	}
	this.tileData[index_] = (transparent) ? true : tempPix;
	this.tileReadState[tileIndex] = 1;
	return this.tileData[index_];
}
GameBoyCore.prototype.drawSpritesForLine = function (line) {
	if (!this.gfxSpriteShow) {
		return;
	}
	var minSpriteY = line - ((this.gfxSpriteDouble) ? 15 : 7);
	// either only do priorityFlag == 0 (all foreground),
	// or first 0x80 (background) and then 0 (foreground)
	var priorityFlag = this.spritePriorityEnabled ? 0x80 : 0;
	for (; priorityFlag >= 0; priorityFlag -= 0x80) {
		var oamIx = 159;
		while (oamIx >= 0) {
			var attributes = 0xFF & this.memory[0xFE00 + oamIx--];
			if ((attributes & 0x80) == priorityFlag || !this.spritePriorityEnabled) {
				var tileNum = (0xFF & this.memory[0xFE00 + oamIx--]);
				var spriteX = (0xFF & this.memory[0xFE00 + oamIx--]) - 8;
				var spriteY = (0xFF & this.memory[0xFE00 + oamIx--]) - 16;
				var offset = line - spriteY;
				if (spriteX >= 160 || spriteY < minSpriteY || offset < 0) {
					continue;
				}
				if (this.gfxSpriteDouble) {
					tileNum = tileNum & 0xFE;
				}
				var spriteAttrib = (attributes >> 5) & 0x03; // flipx: from bit 0x20 to 0x01, flipy: from bit 0x40 to 0x02
				if (this.cGBC) {
					spriteAttrib += 0x20 + ((attributes & 0x07) << 2); // palette
					tileNum += (384 >> 3) * (attributes & 0x08); // tile vram bank
				}
				else {
					// attributes 0x10: 0x00 = OBJ1 palette, 0x10 = OBJ2 palette
					// spriteAttrib: 0x04: OBJ1 palette, 0x08: OBJ2 palette
					spriteAttrib += 0x4 + ((attributes & 0x10) >> 2);
				}
				if (priorityFlag == 0x80) {
				// background
					if (this.gfxSpriteDouble) {
						if ((spriteAttrib & 2) != 0) {
							this.drawPartBgSprite((tileNum | 1) - (offset >> 3), spriteX, line, offset & 7, spriteAttrib);
						}
						else {
							this.drawPartBgSprite((tileNum & -2) + (offset >> 3), spriteX, line, offset & 7, spriteAttrib);
						}
					}
					else {
						this.drawPartBgSprite(tileNum, spriteX, line, offset, spriteAttrib);
					}
				}
				else {
					// foreground
					if (this.gfxSpriteDouble) {
						if ((spriteAttrib & 2) != 0) {
							this.drawPartFgSprite((tileNum | 1) - (offset >> 3), spriteX, line, offset & 7, spriteAttrib);
						}
						else {
							this.drawPartFgSprite((tileNum & -2) + (offset >> 3), spriteX, line, offset & 7, spriteAttrib);
						}
					}
					else {
						this.drawPartFgSprite(tileNum, spriteX, line, offset, spriteAttrib);
					}
				}
			}
			else {
				oamIx -= 3;
			}
		}
	}
}
GameBoyCore.prototype.drawPartFgSprite = function (tileIndex, x, y, sourceLine, attribs) {
	var im = this.tileData[tileIndex + this.tileCount * attribs] || this.updateImage(tileIndex, attribs);
	if (im === true) {
		return;
	}
	var dst = x + y * 160;
	var src = sourceLine * 8;
	var dstEnd = (x > 152) ? ((y + 1) * 160) : (dst + 8);
	if (x < 0) { // adjust left
		dst -= x;
		src -= x;
	}
	while (dst < dstEnd) {
		if (im[src] < 0) {
			this.frameBuffer[dst] = im[src];
		}
		dst++;
		src++;
	}
}
GameBoyCore.prototype.drawPartBgSprite = function (tileIndex, x, y, sourceLine, attribs) {
	var im = this.tileData[tileIndex + this.tileCount * attribs] || this.updateImage(tileIndex, attribs);
	if (im === true) {
		return;
	}
	var dst = x + y * 160;
	var src = sourceLine * 8;
	var dstEnd = (x > 152) ? ((y + 1) * 160) : (dst + 8);  
	if (x < 0) { // adjust left
		dst -= x;
		src -= x;
	}
	while (dst < dstEnd) {
		if (im[src] < 0 && this.frameBuffer[dst] >= 0) {
			this.frameBuffer[dst] = im[src];
		}
		dst++;
		src++;
	}
}
//Memory Reading:
GameBoyCore.prototype.memoryRead = function (address) {
	//Act as a wrapper for reading the returns from the compiled jumps to memory.
	return this.memoryReader[address](this, address);	//This seems to be faster than the usual if/else.
}
GameBoyCore.prototype.memoryReadJumpCompile = function () {
	//Faster in some browsers, since we are doing less conditionals overall by implementing them in advance.
	for (var index = 0x0000; index <= 0xFFFF; index++) {
		if (index < 0x4000) {
			this.memoryReader[index] = this.memoryReadNormal;
		}
		else if (index < 0x8000) {
			this.memoryReader[index] = this.memoryReadROM;
		}
		else if (index >= 0x8000 && index < 0xA000) {
			this.memoryReader[index] = (this.cGBC) ? this.VRAMReadCGBCPU : this.VRAMReadDMGCPU;
		}
		else if (index >= 0xA000 && index < 0xC000) {
			if ((this.numRAMBanks == 1 / 16 && index < 0xA200) || this.numRAMBanks >= 1) {
				if (!this.cMBC3) {
					this.memoryReader[index] = this.memoryReadMBC;
				}
				else {
					//MBC3 RTC + RAM:
					this.memoryReader[index] = this.memoryReadMBC3;
				}
			}
			else {
				this.memoryReader[index] = this.memoryReadBAD;
			}
		}
		else if (index >= 0xC000 && index < 0xE000) {
			if (!this.cGBC || index < 0xD000) {
				this.memoryReader[index] = this.memoryReadNormal;
			}
			else {
				this.memoryReader[index] = this.memoryReadGBCMemory;
			}
		}
		else if (index >= 0xE000 && index < 0xFE00) {
			if (!this.cGBC || index < 0xF000) {
				this.memoryReader[index] = this.memoryReadECHONormal;
			}
			else {
				this.memoryReader[index] = this.memoryReadECHOGBCMemory;
			}
		}
		else if (index < 0xFEA0) {
			this.memoryReader[index] = this.memoryReadOAM;
		}
		else if (this.cGBC && index >= 0xFEA0 && index < 0xFF00) {
			this.memoryReader[index] = this.memoryReadNormal;
		}
		else if (index >= 0xFF00) {
			switch (index) {
				case 0xFF00:
					this.memoryReader[0xFF00] = function (parentObj, address) {
						return 0xC0 | parentObj.memory[0xFF00];	//Top nibble returns as set.
					}
					break;
				case 0xFF01:
					this.memoryReader[0xFF01] = function (parentObj, address) {
						return ((parentObj.memory[0xFF02] & 0x1) == 0x1) ? 0xFF : parentObj.memory[0xFF01];
					}
					break;
				case 0xFF02:
					if (this.cGBC) {
						this.memoryReader[0xFF02] = function (parentObj, address) {
							return 0x7C | parentObj.memory[0xFF02];
						}
					}
					else {
						this.memoryReader[0xFF02] = function (parentObj, address) {
							return 0x7E | parentObj.memory[0xFF02];
						}
					}
					break;
				case 0xFF07:
					this.memoryReader[0xFF07] = function (parentObj, address) {
						return 0xF8 | parentObj.memory[0xFF07];
					}
					break;
				case 0xFF0F:
					this.memoryReader[0xFF0F] = function (parentObj, address) {
						return 0xE0 | parentObj.memory[0xFF0F];
					}
					break;
				case 0xFF10:
					this.memoryReader[0xFF10] = function (parentObj, address) {
						return 0x80 | parentObj.memory[0xFF10];
					}
					break;
				case 0xFF11:
					this.memoryReader[0xFF11] = function (parentObj, address) {
						return 0x3F | parentObj.memory[0xFF11];
					}
					break;
				case 0xFF14:
					this.memoryReader[0xFF14] = function (parentObj, address) {
						return 0xBF | parentObj.memory[0xFF14];
					}
					break;
				case 0xFF16:
					this.memoryReader[0xFF16] = function (parentObj, address) {
						return 0x3F | parentObj.memory[0xFF16];
					}
					break;
				case 0xFF19:
					this.memoryReader[0xFF19] = function (parentObj, address) {
						return 0xBF | parentObj.memory[0xFF19];
					}
					break;
				case 0xFF1A:
					this.memoryReader[0xFF1A] = function (parentObj, address) {
						return 0x7F | parentObj.memory[0xFF1A];
					}
					break;
				case 0xFF1B:
					this.memoryReader[0xFF1B] = function (parentObj, address) {
						return 0xFF;
					}
					break;
				case 0xFF1C:
					this.memoryReader[0xFF1C] = function (parentObj, address) {
						return 0x9F | parentObj.memory[0xFF1C];
					}
					break;
				case 0xFF1E:
					this.memoryReader[0xFF1E] = function (parentObj, address) {
						return 0xBF | parentObj.memory[0xFF1E];
					}
					break;
				case 0xFF20:
					this.memoryReader[0xFF20] = function (parentObj, address) {
						return 0xFF;
					}
					break;
				case 0xFF23:
					this.memoryReader[0xFF23] = function (parentObj, address) {
						return 0xBF | parentObj.memory[0xFF23];
					}
					break;
				case 0xFF26:
					this.memoryReader[0xFF26] = function (parentObj, address) {
						return 0x70 | parentObj.memory[0xFF26];
					}
					break;
				case 0xFF30:
				case 0xFF31:
				case 0xFF32:
				case 0xFF33:
				case 0xFF34:
				case 0xFF35:
				case 0xFF36:
				case 0xFF37:
				case 0xFF38:
				case 0xFF39:
				case 0xFF3A:
				case 0xFF3B:
				case 0xFF3C:
				case 0xFF3D:
				case 0xFF3E:
				case 0xFF3F:
					this.memoryReader[index] = function (parentObj, address) {
						return ((parentObj.memory[0xFF26] & 0x4) == 0x4) ? 0xFF : parentObj.memory[address];
					}
					break;
				case 0xFF41:
					this.memoryReader[0xFF41] = function (parentObj, address) {
						return 0x80 | parentObj.memory[0xFF41] | parentObj.modeSTAT;
					}
					break;
				case 0xFF44:
					this.memoryReader[0xFF44] = function (parentObj, address) {
						return ((parentObj.LCDisOn) ? parentObj.memory[0xFF44] : 0);
					}
					break;
				case 0xFF4F:
					this.memoryReader[0xFF4F] = function (parentObj, address) {
						return parentObj.currVRAMBank;
					}
					break;
				default:
					this.memoryReader[index] = this.memoryReadNormal;
			}
		}
		else {
			this.memoryReader[index] = this.memoryReadBAD;
		}
	}
}
GameBoyCore.prototype.memoryReadNormal = function (parentObj, address) {
	return parentObj.memory[address];
}
GameBoyCore.prototype.memoryReadROM = function (parentObj, address) {
	return parentObj.ROM[parentObj.currentROMBank + address];
}
GameBoyCore.prototype.memoryReadMBC = function (parentObj, address) {
	//Switchable RAM
	if (parentObj.MBCRAMBanksEnabled || settings[10]) {
		return parentObj.MBCRam[address + parentObj.currMBCRAMBankPosition];
	}
	//cout("Reading from disabled RAM.", 1);
	return 0xFF;
}
GameBoyCore.prototype.memoryReadMBC3 = function (parentObj, address) {
	//Switchable RAM
	if (parentObj.MBCRAMBanksEnabled || settings[10]) {
		switch (parentObj.currMBCRAMBank) {
			case 0x00:
			case 0x01:
			case 0x02:
			case 0x03:
				return parentObj.MBCRam[address + parentObj.currMBCRAMBankPosition];
				break;
			case 0x08:
				return parentObj.latchedSeconds;
				break;
			case 0x09:
				return parentObj.latchedMinutes;
				break;
			case 0x0A:
				return parentObj.latchedHours;
				break;
			case 0x0B:
				return parentObj.latchedLDays;
				break;
			case 0x0C:
				return (((parentObj.RTCDayOverFlow) ? 0x80 : 0) + ((parentObj.RTCHALT) ? 0x40 : 0)) + parentObj.latchedHDays;
		}
	}
	//cout("Reading from invalid or disabled RAM.", 1);
	return 0xFF;
}
GameBoyCore.prototype.memoryReadGBCMemory = function (parentObj, address) {
	return parentObj.GBCMemory[address + parentObj.gbcRamBankPosition];
}
GameBoyCore.prototype.memoryReadOAM = function (parentObj, address) {
	return (parentObj.modeSTAT > 1) ?  0xFF : parentObj.memory[address];
}
GameBoyCore.prototype.memoryReadECHOGBCMemory = function (parentObj, address) {
	return parentObj.GBCMemory[address + parentObj.gbcRamBankPositionECHO];
}
GameBoyCore.prototype.memoryReadECHONormal = function (parentObj, address) {
	return parentObj.memory[address - 0x2000];
}
GameBoyCore.prototype.memoryReadBAD = function (parentObj, address) {
	return 0xFF;
}
GameBoyCore.prototype.VRAMReadCGBCPU = function (parentObj, address) {
	//CPU Side Reading The VRAM (Optimized for GameBoy Color)
	return (parentObj.modeSTAT > 2) ? 0xFF : ((parentObj.currVRAMBank == 0) ? parentObj.memory[address] : parentObj.VRAM[address - 0x8000]);
}
GameBoyCore.prototype.VRAMReadDMGCPU = function (parentObj, address) {
	//CPU Side Reading The VRAM (Optimized for classic GameBoy)
	return (parentObj.modeSTAT > 2) ? 0xFF : parentObj.memory[address];
}
GameBoyCore.prototype.VRAMReadGFX = function (address, gbcBank) {
	//Graphics Side Reading The VRAM
	return ((!gbcBank) ? this.memory[0x8000 + address] : this.VRAM[address]);
}
GameBoyCore.prototype.setCurrentMBC1ROMBank = function () {
	//Read the cartridge ROM data from RAM memory:
	switch (this.ROMBank1offs) {
		case 0x00:
		case 0x20:
		case 0x40:
		case 0x60:
			//Bank calls for 0x00, 0x20, 0x40, and 0x60 are really for 0x01, 0x21, 0x41, and 0x61.
			this.currentROMBank = this.ROMBank1offs * 0x4000;
			break;
		default:
			this.currentROMBank = (this.ROMBank1offs - 1) * 0x4000;
	}
	while (this.currentROMBank + 0x4000 >= this.ROM.length) {
		this.currentROMBank -= this.ROM.length;
	}
}
GameBoyCore.prototype.setCurrentMBC2AND3ROMBank = function () {
	//Read the cartridge ROM data from RAM memory:
	//Only map bank 0 to bank 1 here (MBC2 is like MBC1, but can only do 16 banks, so only the bank 0 quirk appears for MBC2):
	this.currentROMBank = Math.max(this.ROMBank1offs - 1, 0) * 0x4000;
	while (this.currentROMBank + 0x4000 >= this.ROM.length) {
		this.currentROMBank -= this.ROM.length;
	}
}
GameBoyCore.prototype.setCurrentMBC5ROMBank = function () {
	//Read the cartridge ROM data from RAM memory:
	this.currentROMBank = (this.ROMBank1offs - 1) * 0x4000;
	while (this.currentROMBank + 0x4000 >= this.ROM.length) {
		this.currentROMBank -= this.ROM.length;
	}
}
//Memory Writing:
GameBoyCore.prototype.memoryWrite = function (address, data) {
	//Act as a wrapper for writing by compiled jumps to specific memory writing functions.
	this.memoryWriter[address](this, address, data);
}
GameBoyCore.prototype.memoryWriteJumpCompile = function () {
	//Faster in some browsers, since we are doing less conditionals overall by implementing them in advance.
	for (var index = 0x0000; index <= 0xFFFF; index++) {
		if (index < 0x8000) {
			if (this.cMBC1) {
				if (index < 0x2000) {
					this.memoryWriter[index] = this.MBCWriteEnable;
				}
				else if (index < 0x4000) {
					this.memoryWriter[index] = this.MBC1WriteROMBank;
				}
				else if (index < 0x6000) {
					this.memoryWriter[index] = this.MBC1WriteRAMBank;
				}
				else {
					this.memoryWriter[index] = this.MBC1WriteType;
				}
			}
			else if (this.cMBC2) {
				if (index < 0x1000) {
					this.memoryWriter[index] = this.MBCWriteEnable;
				}
				else if (index >= 0x2100 && index < 0x2200) {
					this.memoryWriter[index] = this.MBC2WriteROMBank;
				}
				else {
					this.memoryWriter[index] = this.cartIgnoreWrite;
				}
			}
			else if (this.cMBC3) {
				if (index < 0x2000) {
					this.memoryWriter[index] = this.MBCWriteEnable;
				}
				else if (index < 0x4000) {
					this.memoryWriter[index] = this.MBC3WriteROMBank;
				}
				else if (index < 0x6000) {
					this.memoryWriter[index] = this.MBC3WriteRAMBank;
				}
				else {
					this.memoryWriter[index] = this.MBC3WriteRTCLatch;
				}
			}
			else if (this.cMBC5 || this.cRUMBLE) {
				if (index < 0x2000) {
					this.memoryWriter[index] = this.MBCWriteEnable;
				}
				else if (index < 0x3000) {
					this.memoryWriter[index] = this.MBC5WriteROMBankLow;
				}
				else if (index < 0x4000) {
					this.memoryWriter[index] = this.MBC5WriteROMBankHigh;
				}
				else if (index < 0x6000) {
					this.memoryWriter[index] = (this.cRUMBLE) ? this.RUMBLEWriteRAMBank : this.MBC5WriteRAMBank;
				}
				else {
					this.memoryWriter[index] = this.cartIgnoreWrite;
				}
			}
			else if (this.cHuC3) {
				if (index < 0x2000) {
					this.memoryWriter[index] = this.MBCWriteEnable;
				}
				else if (index < 0x4000) {
					this.memoryWriter[index] = this.MBC3WriteROMBank;
				}
				else if (index < 0x6000) {
					this.memoryWriter[index] = this.HuC3WriteRAMBank;
				}
				else {
					this.memoryWriter[index] = this.cartIgnoreWrite;
				}
			}
			else {
				this.memoryWriter[index] = this.cartIgnoreWrite;
			}
		}
		else if (index < 0xA000) {
			this.memoryWriter[index] = this.VRAMWrite;
		}
		else if (index < 0xC000) {
			if ((this.numRAMBanks == 1 / 16 && index < 0xA200) || this.numRAMBanks >= 1) {
				if (!this.cMBC3) {
					this.memoryWriter[index] = this.memoryWriteMBCRAM;
				}
				else {
					//MBC3 RTC + RAM:
					this.memoryWriter[index] = this.memoryWriteMBC3RAM;
				}
			}
			else {
				this.memoryWriter[index] = this.cartIgnoreWrite;
			}
		}
		else if (index < 0xE000) {
			if (this.cGBC && index >= 0xD000) {
				this.memoryWriter[index] = this.memoryWriteGBCRAM;
			}
			else {
				this.memoryWriter[index] = this.memoryWriteNormal;
			}
		}
		else if (index < 0xFE00) {
			if (this.cGBC && index >= 0xF000) {
				this.memoryWriter[index] = this.memoryWriteECHOGBCRAM;
			}
			else {
				this.memoryWriter[index] = this.memoryWriteECHONormal;
			}
		}
		else if (index <= 0xFEA0) {
			this.memoryWriter[index] = this.memoryWriteOAMRAM;
		}
		else if (index < 0xFF00) {
			if (this.cGBC) {											//Only GBC has access to this RAM.
				this.memoryWriter[index] = this.memoryWriteNormal;
			}
			else {
				this.memoryWriter[index] = this.cartIgnoreWrite;
			}
		}
		else {
			//Start the I/O initialization by filling in the slots as normal memory:
			this.memoryWriter[index] = this.memoryWriteNormal;
		}
	}
	this.registerWriteJumpCompile();				//Compile the I/O write functions separately...
}
GameBoyCore.prototype.MBCWriteEnable = function (parentObj, address, data) {
	//MBC RAM Bank Enable/Disable:
	parentObj.MBCRAMBanksEnabled = ((data & 0x0F) == 0x0A);	//If lower nibble is 0x0A, then enable, otherwise disable.
}
GameBoyCore.prototype.MBC1WriteROMBank = function (parentObj, address, data) {
	//MBC1 ROM bank switching:
	parentObj.ROMBank1offs = (parentObj.ROMBank1offs & 0x60) | (data & 0x1F);
	parentObj.setCurrentMBC1ROMBank();
}
GameBoyCore.prototype.MBC1WriteRAMBank = function (parentObj, address, data) {
	//MBC1 RAM bank switching
	if (parentObj.MBC1Mode) {
		//4/32 Mode
		parentObj.currMBCRAMBank = data & 0x3;
		parentObj.currMBCRAMBankPosition = (parentObj.currMBCRAMBank << 13) - 0xA000;
	}
	else {
		//16/8 Mode
		parentObj.ROMBank1offs = ((data & 0x03) << 5) | (parentObj.ROMBank1offs & 0x1F);
		parentObj.setCurrentMBC1ROMBank();
	}
}
GameBoyCore.prototype.MBC1WriteType = function (parentObj, address, data) {
	//MBC1 mode setting:
	parentObj.MBC1Mode = ((data & 0x1) == 0x1);
}
GameBoyCore.prototype.MBC2WriteROMBank = function (parentObj, address, data) {
	//MBC2 ROM bank switching:
	parentObj.ROMBank1offs = data & 0x0F;
	parentObj.setCurrentMBC2AND3ROMBank();
}
GameBoyCore.prototype.MBC3WriteROMBank = function (parentObj, address, data) {
	//MBC3 ROM bank switching:
	parentObj.ROMBank1offs = data & 0x7F;
	parentObj.setCurrentMBC2AND3ROMBank();
}
GameBoyCore.prototype.MBC3WriteRAMBank = function (parentObj, address, data) {
	parentObj.currMBCRAMBank = data;
	if (data < 4) {
		//MBC3 RAM bank switching
		parentObj.currMBCRAMBankPosition = (parentObj.currMBCRAMBank << 13) - 0xA000;
	}
}
GameBoyCore.prototype.MBC3WriteRTCLatch = function (parentObj, address, data) {
	if (data == 0) {
		parentObj.RTCisLatched = false;
	}
	else if (!parentObj.RTCisLatched) {
		//Copy over the current RTC time for reading.
		parentObj.RTCisLatched = true;
		parentObj.latchedSeconds = parentObj.RTCSeconds | 0;
		parentObj.latchedMinutes = parentObj.RTCMinutes;
		parentObj.latchedHours = parentObj.RTCHours;
		parentObj.latchedLDays = (parentObj.RTCDays & 0xFF);
		parentObj.latchedHDays = parentObj.RTCDays >> 8;
	}
}
GameBoyCore.prototype.MBC5WriteROMBankLow = function (parentObj, address, data) {
	//MBC5 ROM bank switching:
	parentObj.ROMBank1offs = (parentObj.ROMBank1offs & 0x100) | data;
	parentObj.setCurrentMBC5ROMBank();
}
GameBoyCore.prototype.MBC5WriteROMBankHigh = function (parentObj, address, data) {
	//MBC5 ROM bank switching (by least significant bit):
	parentObj.ROMBank1offs  = ((data & 0x01) << 8) | (parentObj.ROMBank1offs & 0xFF);
	parentObj.setCurrentMBC5ROMBank();
}
GameBoyCore.prototype.MBC5WriteRAMBank = function (parentObj, address, data) {
	//MBC5 RAM bank switching
	parentObj.currMBCRAMBank = data & 0xF;
	parentObj.currMBCRAMBankPosition = (parentObj.currMBCRAMBank << 13) - 0xA000;
}
GameBoyCore.prototype.RUMBLEWriteRAMBank = function (parentObj, address, data) {
	//MBC5 RAM bank switching
	//Like MBC5, but bit 3 of the lower nibble is used for rumbling and bit 2 is ignored.
	parentObj.currMBCRAMBank = data & 0x3;
	parentObj.currMBCRAMBankPosition = (parentObj.currMBCRAMBank << 13) - 0xA000;
}
GameBoyCore.prototype.HuC3WriteRAMBank = function (parentObj, address, data) {
	//HuC3 RAM bank switching
	parentObj.currMBCRAMBank = data & 0x03;
	parentObj.currMBCRAMBankPosition = (parentObj.currMBCRAMBank << 13) - 0xA000;
}
GameBoyCore.prototype.cartIgnoreWrite = function (parentObj, address, data) {
	//We might have encountered illegal RAM writing or such, so just do nothing...
}
GameBoyCore.prototype.memoryWriteNormal = function (parentObj, address, data) {
	parentObj.memory[address] = data;
}
GameBoyCore.prototype.memoryWriteMBCRAM = function (parentObj, address, data) {
	if (parentObj.MBCRAMBanksEnabled || settings[10]) {
		parentObj.MBCRam[address + parentObj.currMBCRAMBankPosition] = data;
	}
}
GameBoyCore.prototype.memoryWriteMBC3RAM = function (parentObj, address, data) {
	if (parentObj.MBCRAMBanksEnabled || settings[10]) {
		switch (parentObj.currMBCRAMBank) {
			case 0x00:
			case 0x01:
			case 0x02:
			case 0x03:
				parentObj.MBCRam[address + parentObj.currMBCRAMBankPosition] = data;
				break;
			case 0x08:
				if (data < 60) {
					parentObj.RTCSeconds = data;
				}
				else {
					cout("(Bank #" + parentObj.currMBCRAMBank + ") RTC write out of range: " + data, 1);
				}
				break;
			case 0x09:
				if (data < 60) {
					parentObj.RTCMinutes = data;
				}
				else {
					cout("(Bank #" + parentObj.currMBCRAMBank + ") RTC write out of range: " + data, 1);
				}
				break;
			case 0x0A:
				if (data < 24) {
					parentObj.RTCHours = data;
				}
				else {
					cout("(Bank #" + parentObj.currMBCRAMBank + ") RTC write out of range: " + data, 1);
				}
				break;
			case 0x0B:
				parentObj.RTCDays = (data & 0xFF) | (parentObj.RTCDays & 0x100);
				break;
			case 0x0C:
				parentObj.RTCDayOverFlow = (data & 0x80) == 0x80;
				parentObj.RTCHalt = (data & 0x40) == 0x40;
				parentObj.RTCDays = ((data & 0x1) << 8) | (parentObj.RTCDays & 0xFF);
				break;
			default:
				cout("Invalid MBC3 bank address selected: " + parentObj.currMBCRAMBank, 0);
		}
	}
}
GameBoyCore.prototype.memoryWriteGBCRAM = function (parentObj, address, data) {
	parentObj.GBCMemory[address + parentObj.gbcRamBankPosition] = data;
}
GameBoyCore.prototype.memoryWriteOAMRAM = function (parentObj, address, data) {
	if (parentObj.modeSTAT < 2) {		//OAM RAM cannot be written to in mode 2 & 3
		parentObj.memory[address] = data;
	}
}
GameBoyCore.prototype.memoryWriteECHOGBCRAM = function (parentObj, address, data) {
	parentObj.GBCMemory[address + parentObj.gbcRamBankPositionECHO] = data;
}
GameBoyCore.prototype.memoryWriteECHONormal = function (parentObj, address, data) {
	parentObj.memory[address - 0x2000] = data;
}
GameBoyCore.prototype.VRAMWrite = function (parentObj, address, data) {
	if (parentObj.modeSTAT < 3) {	//VRAM cannot be written to during mode 3
		if (address < 0x9800) {		// Bkg Tile data area
			var tileIndex = ((address - 0x8000) >> 4) + (384 * parentObj.currVRAMBank);
			if (parentObj.tileReadState[tileIndex] == 1) {
				var r = parentObj.tileData.length - parentObj.tileCount + tileIndex;
				do {
					parentObj.tileData[r] = null;
					r -= parentObj.tileCount;
				} while (r >= 0);
				parentObj.tileReadState[tileIndex] = 0;
			}
		}
		if (parentObj.currVRAMBank == 0) {
			parentObj.memory[address] = data;
		}
		else {
			parentObj.VRAM[address - 0x8000] = data;
		}
	}
}
GameBoyCore.prototype.registerWriteJumpCompile = function () {
	//I/O Registers (GB + GBC):
	this.memoryWriter[0xFF00] = function (parentObj, address, data) {
		parentObj.memory[0xFF00] = (data & 0x30) | ((((data & 0x20) == 0) ? (parentObj.JoyPad >> 4) : 0xF) & (((data & 0x10) == 0) ? (parentObj.JoyPad & 0xF) : 0xF));
	}
	this.memoryWriter[0xFF02] = function (parentObj, address, data) {
		if (((data & 0x1) == 0x1)) {
			//Internal clock:
			parentObj.memory[0xFF02] = (data & 0x7F);
			parentObj.memory[0xFF0F] |= 0x8;	//Get this time delayed...
		}
		else {
			//External clock:
			parentObj.memory[0xFF02] = data;
			//No connected serial device, so don't trigger interrupt...
		}
	}
	this.memoryWriter[0xFF04] = function (parentObj, address, data) {
		parentObj.memory[0xFF04] = 0;
	}
	this.memoryWriter[0xFF07] = function (parentObj, address, data) {
		parentObj.memory[0xFF07] = data & 0x07;
		parentObj.TIMAEnabled = (data & 0x04) == 0x04;
		parentObj.TACClocker = Math.pow(4, ((data & 0x3) != 0) ? (data & 0x3) : 4);	//TODO: Find a way to not make a conditional in here...
	}
	this.memoryWriter[0xFF10] = function (parentObj, address, data) {
		parentObj.channel1lastTimeSweep = parentObj.channel1timeSweep = (((data & 0x70) >> 4) * parentObj.channel1TimeSweepPreMultiplier) | 0;
		parentObj.channel1numSweep = data & 0x07;
		parentObj.channel1frequencySweepDivider = 1 << parentObj.channel1numSweep;
		parentObj.channel1decreaseSweep = ((data & 0x08) == 0x08);
		parentObj.memory[0xFF10] = data;
	}
	this.memoryWriter[0xFF11] = function (parentObj, address, data) {
		parentObj.channel1adjustedDuty = parentObj.dutyLookup[data >> 6];
		parentObj.channel1lastTotalLength = parentObj.channel1totalLength = (0x40 - (data & 0x3F)) * parentObj.audioTotalLengthMultiplier;
		parentObj.memory[0xFF11] = data & 0xC0;
	}
	this.memoryWriter[0xFF12] = function (parentObj, address, data) {
		parentObj.channel1envelopeVolume = data >> 4;
		parentObj.channel1currentVolume = parentObj.channel1envelopeVolume / 0xF;
		parentObj.channel1envelopeType = ((data & 0x08) == 0x08);
		parentObj.channel1envelopeSweeps = data & 0x7;
		parentObj.channel1volumeEnvTime = parentObj.channel1envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
		parentObj.memory[0xFF12] = data;
	}
	this.memoryWriter[0xFF13] = function (parentObj, address, data) {
		parentObj.channel1frequency = (parentObj.channel1frequency & 0x700) | data;
		//Pre-calculate the frequency computation outside the waveform generator for speed:
		parentObj.channel1adjustedFrequencyPrep = parentObj.preChewedAudioComputationMultiplier / (0x800 - parentObj.channel1frequency);
		parentObj.memory[0xFF13] = data;
	}
	this.memoryWriter[0xFF14] = function (parentObj, address, data) {
		if ((data & 0x80) == 0x80) {
			parentObj.channel1envelopeVolume = parentObj.memory[0xFF12] >> 4;
			parentObj.channel1currentVolume = parentObj.channel1envelopeVolume / 0xF;
			parentObj.channel1envelopeSweeps = parentObj.memory[0xFF12] & 0x7;
			parentObj.channel1volumeEnvTime = parentObj.channel1envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
			parentObj.channel1totalLength = parentObj.channel1lastTotalLength;
			parentObj.channel1timeSweep = parentObj.channel1lastTimeSweep;
			parentObj.channel1numSweep = parentObj.memory[0xFF10] & 0x07;
			parentObj.channel1frequencySweepDivider = 1 << parentObj.channel1numSweep;
			if ((data & 0x40) == 0x40) {
				parentObj.memory[0xFF26] |= 0x1;
			}
		}
		parentObj.channel1consecutive = ((data & 0x40) == 0x0);
		parentObj.channel1frequency = ((data & 0x7) << 8) | (parentObj.channel1frequency & 0xFF);
		//Pre-calculate the frequency computation outside the waveform generator for speed:
		parentObj.channel1adjustedFrequencyPrep = parentObj.preChewedAudioComputationMultiplier / (0x800 - parentObj.channel1frequency);
		parentObj.memory[0xFF14] = data & 0x40;
	}
	this.memoryWriter[0xFF16] = function (parentObj, address, data) {
		parentObj.channel2adjustedDuty = parentObj.dutyLookup[data >> 6];
		parentObj.channel2lastTotalLength = parentObj.channel2totalLength = (0x40 - (data & 0x3F)) * parentObj.audioTotalLengthMultiplier;
		parentObj.memory[0xFF16] = data & 0xC0;
	}
	this.memoryWriter[0xFF17] = function (parentObj, address, data) {
		parentObj.channel2envelopeVolume = data >> 4;
		parentObj.channel2currentVolume = parentObj.channel2envelopeVolume / 0xF;
		parentObj.channel2envelopeType = ((data & 0x08) == 0x08);
		parentObj.channel2envelopeSweeps = data & 0x7;
		parentObj.channel2volumeEnvTime = parentObj.channel2envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
		parentObj.memory[0xFF17] = data;
	}
	this.memoryWriter[0xFF18] = function (parentObj, address, data) {
		parentObj.channel2frequency = (parentObj.channel2frequency & 0x700) | data;
		//Pre-calculate the frequency computation outside the waveform generator for speed:
		parentObj.channel2adjustedFrequencyPrep = parentObj.preChewedAudioComputationMultiplier / (0x800 - parentObj.channel2frequency);
		parentObj.memory[0xFF18] = data;
	}
	this.memoryWriter[0xFF19] = function (parentObj, address, data) {
		if ((data & 0x80) == 0x80) {
			parentObj.channel2envelopeVolume = parentObj.memory[0xFF17] >> 4;
			parentObj.channel2currentVolume = parentObj.channel2envelopeVolume / 0xF;
			parentObj.channel2envelopeSweeps = parentObj.memory[0xFF17] & 0x7;
			parentObj.channel2volumeEnvTime = parentObj.channel2envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
			parentObj.channel2totalLength = parentObj.channel2lastTotalLength;
			if ((data & 0x40) == 0x40) {
				parentObj.memory[0xFF26] |= 0x2;
			}
		}
		parentObj.channel2consecutive = ((data & 0x40) == 0x0);
		parentObj.channel2frequency = ((data & 0x7) << 8) | (parentObj.channel2frequency & 0xFF);
		//Pre-calculate the frequency computation outside the waveform generator for speed:
		parentObj.channel2adjustedFrequencyPrep = parentObj.preChewedAudioComputationMultiplier / (0x800 - parentObj.channel2frequency);
		parentObj.memory[0xFF19] = data & 0x40;
	}
	this.memoryWriter[0xFF1A] = function (parentObj, address, data) {
		parentObj.channel3canPlay = (data >= 0x80);
		if (parentObj.channel3canPlay && (parentObj.memory[0xFF1A] & 0x80) == 0x80) {
			parentObj.channel3totalLength = parentObj.channel3lastTotalLength;
			if (!parentObj.channel3consecutive) {
				parentObj.memory[0xFF26] |= 0x4;
			}
		}
		parentObj.memory[0xFF1A] = data & 0x80;
	}
	this.memoryWriter[0xFF1B] = function (parentObj, address, data) {
		parentObj.channel3lastTotalLength = parentObj.channel3totalLength = (0x100 - data) * parentObj.audioTotalLengthMultiplier;
		parentObj.memory[0xFF1B] = data;
	}
	this.memoryWriter[0xFF1C] = function (parentObj, address, data) {
		parentObj.memory[0xFF1C] = data & 0x60;
		parentObj.channel3patternType = parentObj.memory[0xFF1C] - 0x20;
	}
	this.memoryWriter[0xFF1D] = function (parentObj, address, data) {
		parentObj.channel3frequency = (parentObj.channel3frequency & 0x700) | data;
		parentObj.channel3adjustedFrequencyPrep = parentObj.preChewedWAVEAudioComputationMultiplier / (0x800 - parentObj.channel3frequency);
		parentObj.memory[0xFF1D] = data;
	}
	this.memoryWriter[0xFF1E] = function (parentObj, address, data) {
		if ((data & 0x80) == 0x80) {
			parentObj.channel3totalLength = parentObj.channel3lastTotalLength;
			if ((data & 0x40) == 0x40) {
				parentObj.memory[0xFF26] |= 0x4;
			}
		}
		parentObj.channel3consecutive = ((data & 0x40) == 0x0);
		parentObj.channel3frequency = ((data & 0x7) << 8) | (parentObj.channel3frequency & 0xFF);
		parentObj.channel3adjustedFrequencyPrep = parentObj.preChewedWAVEAudioComputationMultiplier / (0x800 - parentObj.channel3frequency);
		parentObj.memory[0xFF1E] = data & 0x40;
	}
	this.memoryWriter[0xFF20] = function (parentObj, address, data) {
		parentObj.channel4lastTotalLength = parentObj.channel4totalLength = (0x40 - (data & 0x3F)) * parentObj.audioTotalLengthMultiplier;
		parentObj.memory[0xFF20] = data | 0xC0;
	}
	this.memoryWriter[0xFF21] = function (parentObj, address, data) {
		parentObj.channel4envelopeVolume = data >> 4;
		parentObj.channel4currentVolume = parentObj.channel4envelopeVolume / 0xF;
		parentObj.channel4envelopeType = ((data & 0x08) == 0x08);
		parentObj.channel4envelopeSweeps = data & 0x7;
		parentObj.channel4volumeEnvTime = parentObj.channel4envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
		parentObj.memory[0xFF21] = data;
	}
	this.memoryWriter[0xFF22] = function (parentObj, address, data) {
		parentObj.channel4lastSampleLookup = 0;
		parentObj.channel4adjustedFrequencyPrep = parentObj.whiteNoiseFrequencyPreMultiplier / Math.max(data & 0x7, 0.5) / Math.pow(2, (data >> 4) + 1);
		parentObj.noiseTableLookup = ((data & 0x8) == 0x8) ? parentObj.smallNoiseTable : parentObj.largeNoiseTable;
		parentObj.memory[0xFF22] = data;
	}
	this.memoryWriter[0xFF23] = function (parentObj, address, data) {
		parentObj.memory[0xFF23] = data;
		parentObj.channel4consecutive = ((data & 0x40) == 0x0);
		if ((data & 0x80) == 0x80) {
			parentObj.channel4lastSampleLookup = 0;
			parentObj.channel4envelopeVolume = parentObj.memory[0xFF21] >> 4;
			parentObj.channel4currentVolume = parentObj.channel4envelopeVolume / 0xF;
			parentObj.channel4envelopeSweeps = parentObj.memory[0xFF21] & 0x7;
			parentObj.channel4volumeEnvTime = parentObj.channel4envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
			parentObj.channel4totalLength = parentObj.channel4lastTotalLength;
			if ((data & 0x40) == 0x40) {
				parentObj.memory[0xFF26] |= 0x8;
			}
		}
	}
	this.memoryWriter[0xFF24] = function (parentObj, address, data) {
		parentObj.memory[0xFF24] = data;
		/*parentObj.VinLeftChannelEnabled = ((data >> 7) == 0x1);
		parentObj.VinRightChannelEnabled = (((data >> 3) & 0x1) == 0x1);
		parentObj.VinLeftChannelMasterVolume = ((data >> 4) & 0x07);
		parentObj.VinRightChannelMasterVolume = (data & 0x07);
		parentObj.vinLeft = (parentObj.VinLeftChannelEnabled) ? parentObj.VinLeftChannelMasterVolume / 7 : 1;
		parentObj.vinRight = (parentObj.VinRightChannelEnabled) ? parentObj.VinRightChannelMasterVolume / 7 : 1;*/
	}
	this.memoryWriter[0xFF25] = function (parentObj, address, data) {
		parentObj.memory[0xFF25] = data;
		parentObj.leftChannel = [(data & 0x01) == 0x01, (data & 0x02) == 0x02, (data & 0x04) == 0x04, (data & 0x08) == 0x08];
		parentObj.rightChannel = [(data & 0x10) == 0x10, (data & 0x20) == 0x20, (data & 0x40) == 0x40, (data & 0x80) == 0x80];
	}
	this.memoryWriter[0xFF26] = function (parentObj, address, data) {
		var soundEnabled = (data & 0x80);
		parentObj.memory[0xFF26] = soundEnabled | (parentObj.memory[0xFF26] & 0xF);
		parentObj.soundMasterEnabled = (soundEnabled == 0x80);
		if (!parentObj.soundMasterEnabled) {
			parentObj.memory[0xFF26] = 0;
			parentObj.initializeAudioStartState();
			for (address = 0xFF30; address < 0xFF40; address++) {
				parentObj.memory[address] = 0;
			}
		}
	}
	this.memoryWriter[0xFF30] = function (parentObj, address, data) {
		parentObj.memory[0xFF30] = data;
		parentObj.channel3PCM[0x00] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x20] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x40] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x01] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x21] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x41] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF31] = function (parentObj, address, data) {
		parentObj.memory[0xFF31] = data;
		parentObj.channel3PCM[0x02] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x22] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x42] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x03] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x23] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x43] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF32] = function (parentObj, address, data) {
		parentObj.memory[0xFF32] = data;
		parentObj.channel3PCM[0x04] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x24] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x44] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x05] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x25] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x45] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF33] = function (parentObj, address, data) {
		parentObj.memory[0xFF33] = data;
		parentObj.channel3PCM[0x06] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x26] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x46] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x07] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x27] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x47] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF34] = function (parentObj, address, data) {
		parentObj.memory[0xFF34] = data;
		parentObj.channel3PCM[0x08] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x28] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x48] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x09] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x29] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x49] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF35] = function (parentObj, address, data) {
		parentObj.memory[0xFF35] = data;
		parentObj.channel3PCM[0x0A] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x2A] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x4A] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x0B] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x2B] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x4B] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF36] = function (parentObj, address, data) {
		parentObj.memory[0xFF36] = data;
		parentObj.channel3PCM[0x0C] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x2C] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x4C] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x0D] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x2D] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x4D] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF37] = function (parentObj, address, data) {
		parentObj.memory[0xFF37] = data;
		parentObj.channel3PCM[0x0E] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x2E] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x4E] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x0F] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x2F] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x4F] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF38] = function (parentObj, address, data) {
		parentObj.memory[0xFF38] = data;
		parentObj.channel3PCM[0x10] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x30] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x50] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x11] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x31] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x51] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF39] = function (parentObj, address, data) {
		parentObj.memory[0xFF39] = data;
		parentObj.channel3PCM[0x12] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x32] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x52] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x13] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x33] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x53] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF3A] = function (parentObj, address, data) {
		parentObj.memory[0xFF3A] = data;
		parentObj.channel3PCM[0x14] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x34] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x54] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x15] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x35] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x55] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF3B] = function (parentObj, address, data) {
		parentObj.memory[0xFF3B] = data;
		parentObj.channel3PCM[0x16] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x36] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x56] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x17] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x37] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x57] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF3C] = function (parentObj, address, data) {
		parentObj.memory[0xFF3C] = data;
		parentObj.channel3PCM[0x18] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x38] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x58] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x19] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x39] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x59] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF3D] = function (parentObj, address, data) {
		parentObj.memory[0xFF3D] = data;
		parentObj.channel3PCM[0x1A] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x3A] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x5A] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x1B] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x3B] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x5B] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF3E] = function (parentObj, address, data) {
		parentObj.memory[0xFF3E] = data;
		parentObj.channel3PCM[0x1C] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x3C] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x5C] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x1D] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x3D] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x5D] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF3F] = function (parentObj, address, data) {
		parentObj.memory[0xFF3F] = data;
		parentObj.channel3PCM[0x1E] = (data >> 4) / 0xF;
		parentObj.channel3PCM[0x3E] = (data >> 5) / 0xF;
		parentObj.channel3PCM[0x5E] = (data >> 6) / 0xF;
		parentObj.channel3PCM[0x1F] = (data & 0xF) / 0xF;
		parentObj.channel3PCM[0x3F] = (data & 0xE) / 0x1E;
		parentObj.channel3PCM[0x5F] = (data & 0xC) / 0x3C;
	}
	this.memoryWriter[0xFF44] = function (parentObj, address, data) {
		//Read only
	}
	this.memoryWriter[0xFF45] = function (parentObj, address, data) {
		parentObj.memory[0xFF45] = data;
		if (parentObj.LCDisOn) {
			parentObj.matchLYC();	//Get the compare of the first scan line.
		}
	}
	this.memoryWriter[0xFF46] = function (parentObj, address, data) {
		parentObj.memory[0xFF46] = data;
		if (parentObj.cGBC || data > 0x7F) {	//DMG cannot DMA from the ROM banks.
			data <<= 8;
			address = 0xFE00;
			while (address < 0xFEA0) {
				parentObj.memory[address++] = parentObj.memoryReader[data](parentObj, data++);
			}
		}
	}
	this.memoryWriter[0xFF47] = function (parentObj, address, data) {
		parentObj.decodePalette(0, data);
		if (parentObj.memory[0xFF47] != data) {
			parentObj.memory[0xFF47] = data;
			parentObj.invalidateAll(0);
		}
	}
	this.memoryWriter[0xFF48] = function (parentObj, address, data) {
		parentObj.decodePalette(4, data);
		if (parentObj.memory[0xFF48] != data) {
			parentObj.memory[0xFF48] = data;
			parentObj.invalidateAll(1);
		}
	}
	this.memoryWriter[0xFF49] = function (parentObj, address, data) {
		parentObj.decodePalette(8, data);
		if (parentObj.memory[0xFF49] != data) {
			parentObj.memory[0xFF49] = data;
			parentObj.invalidateAll(2);
		}
	}
	if (this.cGBC) {
		//GameBoy Color Specific I/O:
		this.memoryWriter[0xFF40] = function (parentObj, address, data) {
			var temp_var = (data & 0x80) == 0x80;
			if (temp_var != parentObj.LCDisOn) {
				//When the display mode changes...
				parentObj.LCDisOn = temp_var;
				parentObj.memory[0xFF41] &= 0xF8;
				parentObj.STATTracker = parentObj.modeSTAT = parentObj.LCDTicks = parentObj.actualScanLine = parentObj.memory[0xFF44] = 0;
				if (parentObj.LCDisOn) {
					parentObj.matchLYC();	//Get the compare of the first scan line.
					parentObj.LCDCONTROL = parentObj.LINECONTROL;
				}
				else {
					parentObj.LCDCONTROL = parentObj.DISPLAYOFFCONTROL;
					parentObj.DisplayShowOff();
				}
				parentObj.memory[0xFF0F] &= 0xFD;
			}
			parentObj.gfxWindowY = (data & 0x40) == 0x40;
			parentObj.gfxWindowDisplay = (data & 0x20) == 0x20;
			parentObj.gfxBackgroundX = (data & 0x10) == 0x10;
			parentObj.gfxBackgroundY = (data & 0x08) == 0x08;
			parentObj.gfxSpriteDouble = (data & 0x04) == 0x04;
			parentObj.gfxSpriteShow = (data & 0x02) == 0x02;
			parentObj.spritePriorityEnabled = (data & 0x01) == 0x01;
			parentObj.memory[0xFF40] = data;
		}
		this.memoryWriter[0xFF41] = function (parentObj, address, data) {
			parentObj.LYCMatchTriggerSTAT = ((data & 0x40) == 0x40);
			parentObj.mode2TriggerSTAT = ((data & 0x20) == 0x20);
			parentObj.mode1TriggerSTAT = ((data & 0x10) == 0x10);
			parentObj.mode0TriggerSTAT = ((data & 0x08) == 0x08);
			parentObj.memory[0xFF41] = (data & 0xF8);
		}
		this.memoryWriter[0xFF4D] = function (parentObj, address, data) {
			parentObj.memory[0xFF4D] = (data & 0x7F) + (parentObj.memory[0xFF4D] & 0x80);
		}
		this.memoryWriter[0xFF4F] = function (parentObj, address, data) {
			parentObj.currVRAMBank = data & 0x01;
			//Only writable by GBC.
		}
		this.memoryWriter[0xFF51] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				parentObj.memory[0xFF51] = data;
			}
		}
		this.memoryWriter[0xFF52] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				parentObj.memory[0xFF52] = data & 0xF0;
			}
		}
		this.memoryWriter[0xFF53] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				parentObj.memory[0xFF53] = data & 0x1F;
			}
		}
		this.memoryWriter[0xFF54] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				parentObj.memory[0xFF54] = data & 0xF0;
			}
		}
		this.memoryWriter[0xFF55] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				if ((data & 0x80) == 0) {
					//DMA
					parentObj.CPUTicks += 1 + ((8 * ((data & 0x7F) + 1)) * parentObj.multiplier);
					var dmaSrc = (parentObj.memory[0xFF51] << 8) + parentObj.memory[0xFF52];
					var dmaDst = 0x8000 + (parentObj.memory[0xFF53] << 8) + parentObj.memory[0xFF54];
					var endAmount = (((data & 0x7F) * 0x10) + 0x10);
					for (var loopAmount = 0; loopAmount < endAmount; loopAmount++) {
						parentObj.memoryWrite(dmaDst++, parentObj.memoryRead(dmaSrc++));
					}
					parentObj.memory[0xFF51] = ((dmaSrc & 0xFF00) >> 8);
					parentObj.memory[0xFF52] = (dmaSrc & 0x00F0);
					parentObj.memory[0xFF53] = ((dmaDst & 0x1F00) >> 8);
					parentObj.memory[0xFF54] = (dmaDst & 0x00F0);
					parentObj.memory[0xFF55] = 0xFF;	//Transfer completed.
				}
				else {
					//H-Blank DMA
					if (data > 0x80) {
						parentObj.hdmaRunning = true;
						parentObj.memory[0xFF55] = data & 0x7F;
					}
					else {
						parentObj.memory[0xFF55] = 0xFF;
					}
				}
			}
			else if ((data & 0x80) == 0) {
				//Stop H-Blank DMA
				parentObj.hdmaRunning = false;
				parentObj.memory[0xFF55] |= 0x80;
			}
		}
		this.memoryWriter[0xFF68] = function (parentObj, address, data) {
			parentObj.memory[0xFF69] = 0xFF & parentObj.gbcRawPalette[data & 0x3F];
			parentObj.memory[0xFF68] = data;
		}
		this.memoryWriter[0xFF69] = function (parentObj, address, data) {
			parentObj.setGBCPalette(parentObj.memory[0xFF68] & 0x3F, data);
			if (parentObj.usbtsb(parentObj.memory[0xFF68]) < 0) { // high bit = autoincrement
				var next = ((parentObj.usbtsb(parentObj.memory[0xFF68]) + 1) & 0x3F);
				parentObj.memory[0xFF68] = (next | 0x80);
				parentObj.memory[0xFF69] = 0xFF & parentObj.gbcRawPalette[next];
			}
			else {
				parentObj.memory[0xFF69] = data;
			}
		}
		this.memoryWriter[0xFF6A] = function (parentObj, address, data) {
			parentObj.memory[0xFF6B] = 0xFF & parentObj.gbcRawPalette[(data & 0x3F) | 0x40];
			parentObj.memory[0xFF6A] = data;
		}
		this.memoryWriter[0xFF6B] = function (parentObj, address, data) {
			parentObj.setGBCPalette((parentObj.memory[0xFF6A] & 0x3F) + 0x40, data);
			if (parentObj.usbtsb(parentObj.memory[0xFF6A]) < 0) { // high bit = autoincrement
				var next = ((parentObj.memory[0xFF6A] + 1) & 0x3F);
				parentObj.memory[0xFF6A] = (next | 0x80);
				parentObj.memory[0xFF6B] = 0xFF & parentObj.gbcRawPalette[next | 0x40];
			}
			else {
				parentObj.memory[0xFF6B] = data;
			}
		}
		this.memoryWriter[0xFF70] = function (parentObj, address, data) {
			var addressCheck = (parentObj.memory[0xFF51] << 8) | parentObj.memory[0xFF52];	//Cannot change the RAM bank while WRAM is the source of a running HDMA.
			if (!parentObj.hdmaRunning || addressCheck < 0xD000 || addressCheck >= 0xE000) {
				parentObj.gbcRamBank = Math.max(data & 0x07, 1);	//Bank range is from 1-7
				parentObj.gbcRamBankPosition = ((parentObj.gbcRamBank - 1) * 0x1000) - 0xD000;
				parentObj.gbcRamBankPositionECHO = ((parentObj.gbcRamBank - 1) * 0x1000) - 0xF000;
			}
			parentObj.memory[0xFF70] = (data | 0x40);	//Bit 6 cannot be written to.
		}
	}
	else {
		//Fill in the GameBoy Color I/O registers as normal RAM for GameBoy compatibility:
		this.memoryWriter[0xFF40] = function (parentObj, address, data) {
			var temp_var = (data & 0x80) == 0x80;
			if (temp_var != parentObj.LCDisOn) {
				//When the display mode changes...
				parentObj.LCDisOn = temp_var;
				parentObj.memory[0xFF41] &= 0xF8;
				parentObj.STATTracker = parentObj.modeSTAT = parentObj.LCDTicks = parentObj.actualScanLine = parentObj.memory[0xFF44] = 0;
				if (parentObj.LCDisOn) {
					parentObj.matchLYC();	//Get the compare of the first scan line.
					parentObj.LCDCONTROL = parentObj.LINECONTROL;
				}
				else {
					parentObj.LCDCONTROL = parentObj.DISPLAYOFFCONTROL;
					parentObj.DisplayShowOff();
				}
				parentObj.memory[0xFF0F] &= 0xFD;
			}
			parentObj.gfxWindowY = (data & 0x40) == 0x40;
			parentObj.gfxWindowDisplay = (data & 0x20) == 0x20;
			parentObj.gfxBackgroundX = (data & 0x10) == 0x10;
			parentObj.gfxBackgroundY = (data & 0x08) == 0x08;
			parentObj.gfxSpriteDouble = (data & 0x04) == 0x04;
			parentObj.gfxSpriteShow = (data & 0x02) == 0x02;
			if ((data & 0x01) == 0) {
				// this emulates the gbc-in-gb-mode, not the original gb-mode
				parentObj.bgEnabled = false;
				parentObj.gfxWindowDisplay = false;
			}
			else {
				parentObj.bgEnabled = true;
			}
			parentObj.memory[0xFF40] = data;
		}
		this.memoryWriter[0xFF41] = function (parentObj, address, data) {
			parentObj.LYCMatchTriggerSTAT = ((data & 0x40) == 0x40);
			parentObj.mode2TriggerSTAT = ((data & 0x20) == 0x20);
			parentObj.mode1TriggerSTAT = ((data & 0x10) == 0x10);
			parentObj.mode0TriggerSTAT = ((data & 0x08) == 0x08);
			parentObj.memory[0xFF41] = (data & 0xF8);
			if (parentObj.LCDisOn && parentObj.modeSTAT < 2) {
				parentObj.memory[0xFF0F] |= 0x2;
			}
		}
		this.memoryWriter[0xFF4D] = function (parentObj, address, data) {
			parentObj.memory[0xFF4D] = data;
		}
		this.memoryWriter[0xFF4F] = function (parentObj, address, data) {
			//Not writable in DMG mode.
		}
		this.memoryWriter[0xFF55] = function (parentObj, address, data) {
			parentObj.memory[0xFF55] = data;
		}
		this.memoryWriter[0xFF68] = function (parentObj, address, data) {
			parentObj.memory[0xFF68] = data;
		}
		this.memoryWriter[0xFF69] = function (parentObj, address, data) {
			parentObj.memory[0xFF69] = data;
		}
		this.memoryWriter[0xFF6A] = function (parentObj, address, data) {
			parentObj.memory[0xFF6A] = data;
		}
		this.memoryWriter[0xFF6B] = function (parentObj, address, data) {
			parentObj.memory[0xFF6B] = data;
		}
		this.memoryWriter[0xFF70] = function (parentObj, address, data) {
			parentObj.memory[0xFF70] = data;
		}
	}
	//Boot I/O Registers:
	if (this.inBootstrap) {
		this.memoryWriter[0xFF50] = function (parentObj, address, data) {
			cout("Boot ROM reads blocked: Bootstrap process has ended.", 0);
			parentObj.inBootstrap = false;
			parentObj.disableBootROM();			//Fill in the boot ROM ranges with ROM  bank 0 ROM ranges
			parentObj.memory[0xFF50] = data;	//Bits are sustained in memory?
		}
		this.memoryWriter[0xFF6C] = function (parentObj, address, data) {
			if (parentObj.inBootstrap) {
				parentObj.cGBC = (data == 0x80);
				cout("Booted to GBC Mode: " + parentObj.cGBC, 0);
			}
			parentObj.memory[0xFF6C] = data;
		}
	}
	else {
		//Lockout the ROMs from accessing the BOOT ROM control register:
		this.memoryWriter[0xFF6C] = this.memoryWriter[0xFF50] = function (parentObj, address, data) { };
	}
}
//Helper Functions
GameBoyCore.prototype.usbtsb = function (ubyte) {
	//Unsigned byte to signed byte:
	return (ubyte > 0x7F) ? ((ubyte & 0x7F) - 0x80) : ubyte;
}
GameBoyCore.prototype.unsbtub = function (ubyte) {
	//Keep an unsigned byte unsigned:
	if (ubyte < 0) {
		ubyte += 0x100;
	}
	return ubyte;	//If this function is called, no wrapping requested.
}
GameBoyCore.prototype.toTypedArray = function (baseArray, bit32, unsigned) {
	try {
		var typedArrayTemp = (bit32) ? ((unsigned) ? new Uint32Array(baseArray.length) : new Int32Array(baseArray.length)) : new Uint8Array(baseArray.length);
		for (var index = 0; index < baseArray.length; index++) {
			typedArrayTemp[index] = baseArray[index];
		}
		return typedArrayTemp;
	}
	catch (error) {
		cout("Could not convert an array to a typed array: " + error.message, 1);
		return baseArray;
	}
}
GameBoyCore.prototype.fromTypedArray = function (baseArray) {
	try {
		var arrayTemp = new Array(baseArray.length);
		for (var index = 0; index < baseArray.length; index++) {
			arrayTemp[index] = baseArray[index];
		}
		return arrayTemp;
	}
	catch (error) {
		return baseArray;
	}
}
GameBoyCore.prototype.getTypedArray = function (length, defaultValue, numberType) {
	try {
		if (settings[22]) {
			throw(new Error(""));
		}
		switch (numberType) {
			case "uint8":
				var arrayHandle = new Uint8Array(length);
				break;
			case "int8":
				var arrayHandle = new Int8Array(length);
				break;
			case "uint16":
				var arrayHandle = new Uint16Array(length);
				break;
			case "int16":
				var arrayHandle = new Int16Array(length);
				break;
			case "uint32":
				var arrayHandle = new Uint32Array(length);
				break;
			case "int32":
				var arrayHandle = new Int32Array(length);
				break;
			case "float32":
				var arrayHandle = new Float32Array(length);
		}
		if (defaultValue > 0) {
			var index = 0;
			while (index < length) {
				arrayHandle[index++] = defaultValue;
			}
		}
	}
	catch (error) {
		var arrayHandle = new Array(length);
		var index = 0;
		while (index < length) {
			arrayHandle[index++] = defaultValue;
		}
	}
	return arrayHandle;
}
GameBoyCore.prototype.ArrayPad = function (length, defaultValue) {
	var arrayHandle = new Array(length);
	var index = 0;
	while (index < length) {
		arrayHandle[index++] = defaultValue;
	}
	return arrayHandle;
}