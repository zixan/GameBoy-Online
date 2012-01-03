"use strict";
/* 
 * JavaScript GameBoy Color Emulator
 * Copyright (C) 2010 - 2011 Grant Galitz
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
function GameBoyCore(canvas, ROMImage) {
	//Params, etc...
	this.canvas = canvas;						//Canvas DOM object for drawing out the graphics to.
	this.drawContext = null;					// LCD Context
	this.ROMImage = ROMImage;					//The game's ROM. 
	//CPU Registers and Flags:
	this.registerA = 0x01; 						//Register A (Accumulator)
	this.FZero = true; 							//Register F  - Result was zero
	this.FSubtract = false;						//Register F  - Subtraction was executed
	this.FHalfCarry = true;						//Register F  - Half carry or half borrow
	this.FCarry = true;							//Register F  - Carry or borrow
	this.registerB = 0x00;						//Register B
	this.registerC = 0x13;						//Register C
	this.registerD = 0x00;						//Register D
	this.registerE = 0xD8;						//Register E
	this.registersHL = 0x014D;					//Registers H and L combined
	this.stackPointer = 0xFFFE;					//Stack Pointer
	this.programCounter = 0x0100;				//Program Counter
	//Some CPU Emulation State Variables:
	this.CPUCyclesPerIteration = 0;				//Relative CPU clocking to speed set.
	this.CPUCyclesTotal = 0;					//Relative CPU clocking to speed set, rounded appropriately.
	this.CPUCyclesTotalBase = 0;				//Relative CPU clocking to speed set base.
	this.CPUCyclesTotalCurrent = 0;				//Relative CPU clocking to speed set, the directly used value.
	this.CPUCyclesTotalRoundoff = 0;			//Clocking per iteration rounding catch.
	this.baseCPUCyclesPerIteration	= 0;		//CPU clocks per iteration at 1x speed.
	this.remainingClocks = 0;					//HALT clocking overrun carry over.
	this.inBootstrap = true;					//Whether we're in the GBC boot ROM.
	this.usedBootROM = false;					//Updated upon ROM loading...
	this.usedGBCBootROM = false;				//Did we boot to the GBC boot ROM?
	this.halt = false;							//Has the CPU been suspended until the next interrupt?
	this.skipPCIncrement = false;				//Did we trip the DMG Halt bug?
	this.stopEmulator = 3;						//Has the emulation been paused or a frame has ended?
	this.IME = true;							//Are interrupts enabled?
	this.IRQLineMatched = 0;					//CPU IRQ assertion.
	this.interruptsRequested = 0;				//IF Register
	this.interruptsEnabled = 0;					//IE Register
	this.hdmaRunning = false;					//HDMA Transfer Flag - GBC only
	this.CPUTicks = 0;							//The number of clock cycles emulated.
	this.doubleSpeedShifter = 0;				//GBC double speed clocking shifter.
	this.JoyPad = 0xFF;							//Joypad State (two four-bit states actually)
	//Main RAM, MBC RAM, GBC Main RAM, VRAM, etc.
	this.memoryReader = [];						//Array of functions mapped to read back memory
	this.memoryWriter = [];						//Array of functions mapped to write to memory
	this.memoryHighReader = [];					//Array of functions mapped to read back 0xFFXX memory
	this.memoryHighWriter = [];					//Array of functions mapped to write to 0xFFXX memory
	this.ROM = [];								//The full ROM file dumped to an array.
	this.memory = [];							//Main Core Memory
	this.MBCRam = [];							//Switchable RAM (Used by games for more RAM) for the main memory range 0xA000 - 0xC000.
	this.VRAM = [];								//Extra VRAM bank for GBC.
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
	this.spriteCount = 252;						//Mode 3 extra clocking counter (Depends on how many sprites are on the current line.).
	this.LYCMatchTriggerSTAT = false;			//Should we trigger an interrupt if LY==LYC?
	this.mode2TriggerSTAT = false;				//Should we trigger an interrupt if in mode 2?
	this.mode1TriggerSTAT = false;				//Should we trigger an interrupt if in mode 1?
	this.mode0TriggerSTAT = false;				//Should we trigger an interrupt if in mode 0?
	this.LCDisOn = false;						//Is the emulated LCD controller on?
	this.LINECONTROL = [];						//Array of functions to handle each scan line we do (onscreen + offscreen)
	this.DISPLAYOFFCONTROL = [function (parentObj) {
		//Array of line 0 function to handle the LCD controller when it's off (Do nothing!).
	}];
	this.LCDCONTROL = null;						//Pointer to either LINECONTROL or DISPLAYOFFCONTROL.
	this.initializeLCDController();				//Compile the LCD controller functions.
	//RTC (Real Time Clock for MBC3):
	this.RTCisLatched = false;
	this.latchedSeconds = 0;					//RTC latched seconds.
	this.latchedMinutes = 0;					//RTC latched minutes.
	this.latchedHours = 0;						//RTC latched hours.
	this.latchedLDays = 0;						//RTC latched lower 8-bits of the day counter.
	this.latchedHDays = 0;						//RTC latched high-bit of the day counter.
	this.RTCSeconds = 0;						//RTC seconds counter.
	this.RTCMinutes = 0;						//RTC minutes counter.
	this.RTCHours = 0;							//RTC hours counter.
	this.RTCDays = 0;							//RTC days counter.
	this.RTCDayOverFlow = false;				//Did the RTC overflow and wrap the day counter?
	this.RTCHALT = false;						//Is the RTC allowed to clock up?
	//Gyro:
	this.highX = 127;
	this.lowX = 127;
	this.highY = 127;
	this.lowY = 127;
	//Sound variables:
	this.audioHandle = null;					//XAudioJS handle
	this.numSamplesTotal = 0;					//Length of the sound buffers.
	this.sampleSize = 0;						//Length of the sound buffer for one channel.
	this.dutyLookup = [0.125, 0.25, 0.5, 0.75];	//Map the duty values given to ones we can work with.
	this.currentBuffer = [];					//The audio buffer we're working on.
	this.audioInternalBuffer = [];				//A temporary buffer used in output management.
	this.bufferContainAmount = 0;				//Buffer maintenance metric.
	this.LSFR15Table = null;
	this.LSFR7Table = null;
	this.noiseSampleTable = null;
	this.initializeAudioStartState();
	this.soundMasterEnabled = false;			//As its name implies
	this.channel3PCM = null;					//Channel 3 adjusted sample buffer.
	//Vin Shit:
	this.VinLeftChannelMasterVolume = 1;		//Computed post-mixing volume.
	this.VinRightChannelMasterVolume = 1;		//Computed post-mixing volume.
	//Channel paths enabled:
	this.leftChannel0 = false;
	this.leftChannel1 = false;
	this.leftChannel2 = false;
	this.leftChannel3 = false;
	this.rightChannel0 = false;
	this.rightChannel1 = false;
	this.rightChannel2 = false;
	this.rightChannel3 = false;
	//Current Samples Being Computed:
	this.currentSampleLeft = 0;
	this.currentSampleRight = 0;
	//Pre-multipliers to cache some calculations:
	this.initializeTiming();
	this.samplesOut = 0;				//Premultiplier for audio samples per instruction.
	//Audio generation counters:
	this.audioTicks = 0;				//Used to sample the audio system every x CPU instructions.
	this.audioIndex = 0;				//Used to keep alignment on audio generation.
	this.rollover = 0;					//Used to keep alignment on the number of samples to output (Realign from counter alias).
	//Timing Variables
	this.emulatorTicks = 0;				//Times for how many instructions to execute before ending the loop.
	this.DIVTicks = 56;					//DIV Ticks Counter (Invisible lower 8-bit)
	this.LCDTicks = 60;					//Counter for how many instructions have been executed on a scanline so far.
	this.timerTicks = 0;				//Counter for the TIMA timer.
	this.TIMAEnabled = false;			//Is TIMA enabled?
	this.TACClocker = 1024;				//Timer Max Ticks
	this.serialTimer = 0;				//Serial IRQ Timer
	this.serialShiftTimer = 0;			//Serial Transfer Shift Timer
	this.serialShiftTimerAllocated = 0;	//Serial Transfer Shift Timer Refill
	this.IRQEnableDelay = 0;			//Are the interrupts on queue to be enabled?
	var dateVar = new Date();
	this.lastIteration = dateVar.getTime();//The last time we iterated the main loop.
	dateVar = new Date();
	this.firstIteration = dateVar.getTime();
	this.iterations = 0;
	this.actualScanLine = 0;			//Actual scan line...
	this.haltPostClocks = 0;			//Post-Halt clocking.
	//ROM Cartridge Components:
	this.cMBC1 = false;					//Does the cartridge use MBC1?
	this.cMBC2 = false;					//Does the cartridge use MBC2?
	this.cMBC3 = false;					//Does the cartridge use MBC3?
	this.cMBC5 = false;					//Does the cartridge use MBC5?
	this.cMBC7 = false;					//Does the cartridge use MBC7?
	this.cSRAM = false;					//Does the cartridge use save RAM?
	this.cMMMO1 = false;				//...
	this.cRUMBLE = false;				//Does the cartridge use the RUMBLE addressing (modified MBC5)?
	this.cCamera = false;				//Is the cartridge actually a GameBoy Camera?
	this.cTAMA5 = false;				//Does the cartridge use TAMA5? (Tamagotchi Cartridge)
	this.cHuC3 = false;					//Does the cartridge use HuC3 (Hudson Soft / modified MBC3)?
	this.cHuC1 = false;					//Does the cartridge use HuC1 (Hudson Soft / modified MBC1)?
	this.cTIMER = false;				//Does the cartridge have an RTC?
	this.ROMBanks = [					// 1 Bank = 16 KBytes = 256 Kbits
		2, 4, 8, 16, 32, 64, 128, 256, 512
	];
	this.ROMBanks[0x52] = 72;
	this.ROMBanks[0x53] = 80;
	this.ROMBanks[0x54] = 96;
	this.numRAMBanks = 0;					//How many RAM banks were actually allocated?
	////Graphics Variables
	this.currVRAMBank = 0;					//Current VRAM bank for GBC.
	this.gfxWindowDisplay = false;			//Is the windows enabled?
	this.gfxSpriteShow = false;				//Are sprites enabled?
	this.gfxSpriteNormalHeight = true;			//Are we doing 8x8 or 8x16 sprites?
	this.bgEnabled = true;					//Is the BG enabled?
	this.BGPriorityEnabled = 0x1000000;		//Can we flag the BG for priority over sprites?
	this.gfxWindowCHRBankPosition = 0;		//The current bank of the character map the window uses.
	this.gfxBackgroundCHRBankPosition = 0;	//The current bank of the character map the BG uses.
	this.gfxBackgroundBankOffset = 0x80;	//Fast mapping of the tile numbering/
	this.windowY = 0;						//Current Y offset of the window.
	this.windowX = 0;						//Current X offset of the window.
	this.drewBlank = 0;						//To prevent the repeating of drawing a blank screen.
	this.drewFrame = false;					//Throttle how many draws we can do to once per iteration.
	this.midScanlineOffset = 0;				//mid-scanline rendering offset.
	//BG Tile Pointer Caches:
	this.BGCHRBank1 = null;
	this.BGCHRBank2 = null;
	this.BGCHRCurrentBank = null;
	//DMG X-Coord to OAM address lookup cache:
	this.OAMAddresses = this.ArrayPad(168, null);
	//Tile Data Cache:
	this.tileCache = null;
	this.tileCacheValid = null;
	//Palettes:
	this.colors = [0xEFFFDE, 0xADD794, 0x529273, 0x183442];			//"Classic" GameBoy palette colors.
	this.objColors = [0x1EFFFDE, 0x1ADD794, 0x1529273, 0x1183442];	//"Classic" GameBoy sprite palette colors.
	this.OBJPalette = null;
	this.BGPalette = null;
	this.gbcOBJRawPalette = null;
	this.gbcBGRawPalette = null;
	this.gbOBJPalette = null;
	this.gbBGPalette = null;
	this.gbcOBJPalette = null;
	this.gbcBGPalette = null;
	this.gbBGColorizedPalette = null;
	this.gbOBJColorizedPalette = null;
	this.cachedBGPaletteConversion = null;
	this.cachedOBJPaletteConversion = null;
	this.updateGBBGPalette = this.updateGBRegularBGPalette;
	this.updateGBOBJPalette = this.updateGBRegularOBJPalette;
	this.colorizedGBPalettes = false;
	this.BGLayerRender = null;			//Reference to the BG rendering function.
	this.WindowLayerRender = null;		//Reference to the window rendering function.
	this.SpriteLayerRender = null;		//Reference to the OAM rendering function.
	this.frameBuffer = [];				//The internal frame-buffer.
	this.completeFrame = [];			//The v-blank sync'd frame buffer.
	this.canvasBuffer = null;			//imageData handle
	this.pixelStart = 0;				//Temp variable for holding the current working framebuffer offset.
	this.frameCount = settings[12];		//Frame skip tracker
	//Variables used for scaling in JS:
	this.width = 160;
	this.height = 144;
	this.pixelCount = this.width * this.height;
	this.rgbCount = this.pixelCount * 4;
	this.widthRatio = 160 / this.width;
	this.heightRatio = 144 / this.height;
}
GameBoyCore.prototype.GBBOOTROM = [		//GB BOOT ROM
	//Converted Neviksti's ROM dump to this array:
	0x31, 0xFE, 0xFF, 0xAF, 0x21, 0xFF, 0x9F, 0x32,		0xCB, 0x7C, 0x20, 0xFB, 0x21, 0x26, 0xFF, 0x0E,
	0x11, 0x3E, 0x80, 0x32, 0xE2, 0x0C, 0x3E, 0xF3,		0xE2, 0x32, 0x3E, 0x77, 0x77, 0x3E, 0xFC, 0xE0,
	0x47, 0x11, 0x04, 0x01, 0x21, 0x10, 0x80, 0x1A,		0xCD, 0x95, 0x00, 0xCD, 0x96, 0x00, 0x13, 0x7B,
	0xFE, 0x34, 0x20, 0xF3, 0x11, 0xD8, 0x00, 0x06,		0x08, 0x1A, 0x13, 0x22, 0x23, 0x05, 0x20, 0xF9,
	0x3E, 0x19, 0xEA, 0x10, 0x99, 0x21, 0x2F, 0x99,		0x0E, 0x0C, 0x3D, 0x28, 0x08, 0x32, 0x0D, 0x20,
	0xF9, 0x2E, 0x0F, 0x18, 0xF3, 0x67, 0x3E, 0x64,		0x57, 0xE0, 0x42, 0x3E, 0x91, 0xE0, 0x40, 0x04,
	0x1E, 0x02, 0x0E, 0x0C, 0xF0, 0x44, 0xFE, 0x90,		0x20, 0xFA, 0x0D, 0x20, 0xF7, 0x1D, 0x20, 0xF2,
	0x0E, 0x13, 0x24, 0x7C, 0x1E, 0x83, 0xFE, 0x62,		0x28, 0x06, 0x1E, 0xC1, 0xFE, 0x64, 0x20, 0x06,
	0x7B, 0xE2, 0x0C, 0x3E, 0x87, 0xE2, 0xF0, 0x42,		0x90, 0xE0, 0x42, 0x15, 0x20, 0xD2, 0x05, 0x20,
	0x4F, 0x16, 0x20, 0x18, 0xCB, 0x4F, 0x06, 0x04,		0xC5, 0xCB, 0x11, 0x17, 0xC1, 0xCB, 0x11, 0x17,
	0x05, 0x20, 0xF5, 0x22, 0x23, 0x22, 0x23, 0xC9,		0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B,
	0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,		0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
	0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,		0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC,
	0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,		0x3C, 0x42, 0xB9, 0xA5, 0xB9, 0xA5, 0x42, 0x3C,
	0x21, 0x04, 0x01, 0x11, 0xA8, 0x00, 0x1A, 0x13,		0xBE, 0x20, 0xFE, 0x23, 0x7D, 0xFE, 0x34, 0x20,
	0xF5, 0x06, 0x19, 0x78, 0x86, 0x23, 0x05, 0x20,		0xFB, 0x86, 0x20, 0xFE, 0x3E, 0x01, 0xE0, 0x50
];
GameBoyCore.prototype.GBCBOOTROM = [	//GBC BOOT ROM (Thanks to Costis for the binary dump that I converted to this):
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
];
GameBoyCore.prototype.ffxxDump = [	//Dump of the post-BOOT I/O register state (From gambatte):
	0x0F, 0x00, 0x7C, 0xFF, 0x00, 0x00, 0x00, 0xF8, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
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
];
GameBoyCore.prototype.OPCODE = [
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
		parentObj.memoryWrite((parentObj.registerB << 8) | parentObj.registerC, parentObj.registerA);
	},
	//INC BC
	//#0x03:
	function (parentObj) {
		var temp_var = ((parentObj.registerB << 8) | parentObj.registerC) + 1;
		parentObj.registerB = (temp_var >> 8) & 0xFF;
		parentObj.registerC = temp_var & 0xFF;
	},
	//INC B
	//#0x04:
	function (parentObj) {
		parentObj.registerB = (parentObj.registerB + 1) & 0xFF;
		parentObj.FZero = (parentObj.registerB == 0);
		parentObj.FHalfCarry = ((parentObj.registerB & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC B
	//#0x05:
	function (parentObj) {
		parentObj.registerB = (parentObj.registerB - 1) & 0xFF;
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
		parentObj.FCarry = (parentObj.registerA > 0x7F);
		parentObj.registerA = ((parentObj.registerA << 1) & 0xFF) | (parentObj.registerA >> 7);
		parentObj.FZero = parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//LD (nn), SP
	//#0x08:
	function (parentObj) {
		var temp_var = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		parentObj.memoryWrite(temp_var, parentObj.stackPointer & 0xFF);
		parentObj.memoryWrite((temp_var + 1) & 0xFFFF, parentObj.stackPointer >> 8);
	},
	//ADD HL, BC
	//#0x09:
	function (parentObj) {
		var dirtySum = parentObj.registersHL + ((parentObj.registerB << 8) | parentObj.registerC);
		parentObj.FHalfCarry = ((parentObj.registersHL & 0xFFF) > (dirtySum & 0xFFF));
		parentObj.FCarry = (dirtySum > 0xFFFF);
		parentObj.registersHL = dirtySum & 0xFFFF;
		parentObj.FSubtract = false;
	},
	//LD A, (BC)
	//#0x0A:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryRead((parentObj.registerB << 8) | parentObj.registerC);
	},
	//DEC BC
	//#0x0B:
	function (parentObj) {
		var temp_var = (((parentObj.registerB << 8) | parentObj.registerC) - 1) & 0xFFFF;
		parentObj.registerB = temp_var >> 8;
		parentObj.registerC = temp_var & 0xFF;
	},
	//INC C
	//#0x0C:
	function (parentObj) {
		parentObj.registerC = (parentObj.registerC + 1) & 0xFF;
		parentObj.FZero = (parentObj.registerC == 0);
		parentObj.FHalfCarry = ((parentObj.registerC & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC C
	//#0x0D:
	function (parentObj) {
		parentObj.registerC = (parentObj.registerC - 1) & 0xFF;
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
		parentObj.registerA = (parentObj.registerA >> 1) | ((parentObj.registerA & 1) << 7);
		parentObj.FCarry = (parentObj.registerA > 0x7F);
		parentObj.FZero = parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//STOP
	//#0x10:
	function (parentObj) {
		if (parentObj.cGBC) {
			if ((parentObj.memory[0xFF4D] & 0x01) == 0x01) {		//Speed change requested.
				if (parentObj.memory[0xFF4D] > 0x7F) {				//Go back to single speed mode.
					cout("Going into single clock speed mode.", 0);
					parentObj.doubleSpeedShifter = 0;
					parentObj.memory[0xFF4D] &= 0x7F;				//Clear the double speed mode flag.
				}
				else {												//Go to double speed mode.
					cout("Going into double clock speed mode.", 0);
					parentObj.doubleSpeedShifter = 1;
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
		parentObj.memoryWrite((parentObj.registerD << 8) | parentObj.registerE, parentObj.registerA);
	},
	//INC DE
	//#0x13:
	function (parentObj) {
		var temp_var = ((parentObj.registerD << 8) | parentObj.registerE) + 1;
		parentObj.registerD = (temp_var >> 8) & 0xFF;
		parentObj.registerE = temp_var & 0xFF;
	},
	//INC D
	//#0x14:
	function (parentObj) {
		parentObj.registerD = (parentObj.registerD + 1) & 0xFF;
		parentObj.FZero = (parentObj.registerD == 0);
		parentObj.FHalfCarry = ((parentObj.registerD & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC D
	//#0x15:
	function (parentObj) {
		parentObj.registerD = (parentObj.registerD - 1) & 0xFF;
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
		parentObj.FCarry = (parentObj.registerA > 0x7F);
		parentObj.registerA = ((parentObj.registerA << 1) & 0xFF) | carry_flag;
		parentObj.FZero = parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//JR n
	//#0x18:
	function (parentObj) {
		parentObj.programCounter = (parentObj.programCounter + ((parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 24) >> 24) + 1) & 0xFFFF;
	},
	//ADD HL, DE
	//#0x19:
	function (parentObj) {
		var dirtySum = parentObj.registersHL + ((parentObj.registerD << 8) | parentObj.registerE);
		parentObj.FHalfCarry = ((parentObj.registersHL & 0xFFF) > (dirtySum & 0xFFF));
		parentObj.FCarry = (dirtySum > 0xFFFF);
		parentObj.registersHL = dirtySum & 0xFFFF;
		parentObj.FSubtract = false;
	},
	//LD A, (DE)
	//#0x1A:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryRead((parentObj.registerD << 8) | parentObj.registerE);
	},
	//DEC DE
	//#0x1B:
	function (parentObj) {
		var temp_var = (((parentObj.registerD << 8) | parentObj.registerE) - 1) & 0xFFFF;
		parentObj.registerD = temp_var >> 8;
		parentObj.registerE = temp_var & 0xFF;
	},
	//INC E
	//#0x1C:
	function (parentObj) {
		parentObj.registerE = (parentObj.registerE + 1) & 0xFF;
		parentObj.FZero = (parentObj.registerE == 0);
		parentObj.FHalfCarry = ((parentObj.registerE & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC E
	//#0x1D:
	function (parentObj) {
		parentObj.registerE = (parentObj.registerE - 1) & 0xFF;
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
		parentObj.registerA = (parentObj.registerA >> 1) | carry_flag;
		parentObj.FZero = parentObj.FSubtract = parentObj.FHalfCarry = false;
	},
	//JR NZ, n
	//#0x20:
	function (parentObj) {
		if (!parentObj.FZero) {
			parentObj.programCounter = (parentObj.programCounter + ((parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 24) >> 24) + 1) & 0xFFFF;
			parentObj.CPUTicks += 4;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		}
	},
	//LD HL, nn
	//#0x21:
	function (parentObj) {
		parentObj.registersHL = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//LDI (HL), A
	//#0x22:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registerA);
		parentObj.registersHL = (parentObj.registersHL + 1) & 0xFFFF;
	},
	//INC HL
	//#0x23:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL + 1) & 0xFFFF;
	},
	//INC H
	//#0x24:
	function (parentObj) {
		var H = ((parentObj.registersHL >> 8) + 1) & 0xFF;
		parentObj.FZero = (H == 0);
		parentObj.FHalfCarry = ((H & 0xF) == 0);
		parentObj.FSubtract = false;
		parentObj.registersHL = (H << 8) | (parentObj.registersHL & 0xFF);
	},
	//DEC H
	//#0x25:
	function (parentObj) {
		var H = ((parentObj.registersHL >> 8) - 1) & 0xFF;
		parentObj.FZero = (H == 0);
		parentObj.FHalfCarry = ((H & 0xF) == 0xF);
		parentObj.FSubtract = true;
		parentObj.registersHL = (H << 8) | (parentObj.registersHL & 0xFF);
	},
	//LD H, n
	//#0x26:
	function (parentObj) {
		parentObj.registersHL = (parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 8) | (parentObj.registersHL & 0xFF);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//DAA
	//#0x27:
	function (parentObj) {
		if (!parentObj.FSubtract) {
			if (parentObj.FCarry || parentObj.registerA > 0x99) {
				parentObj.registerA = (parentObj.registerA + 0x60) & 0xFF;
				parentObj.FCarry = true;
			}
			if (parentObj.FHalfCarry || (parentObj.registerA & 0xF) > 0x9) {
				parentObj.registerA = (parentObj.registerA + 0x06) & 0xFF;
				parentObj.FHalfCarry = false;
			}
		}
		else if (parentObj.FCarry && parentObj.FHalfCarry) {
			parentObj.registerA = (parentObj.registerA + 0x9A) & 0xFF;
			parentObj.FHalfCarry = false;
		}
		else if (parentObj.FCarry) {
			parentObj.registerA = (parentObj.registerA + 0xA0) & 0xFF;
		}
		else if (parentObj.FHalfCarry) {
			parentObj.registerA = (parentObj.registerA + 0xFA) & 0xFF;
			parentObj.FHalfCarry = false;
		}
		parentObj.FZero = (parentObj.registerA == 0);
	},
	//JR Z, n
	//#0x28:
	function (parentObj) {
		if (parentObj.FZero) {
			parentObj.programCounter = (parentObj.programCounter + ((parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 24) >> 24) + 1) & 0xFFFF;
			parentObj.CPUTicks += 4;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		}
	},
	//ADD HL, HL
	//#0x29:
	function (parentObj) {
		parentObj.FHalfCarry = ((parentObj.registersHL & 0xFFF) > 0x7FF);
		parentObj.FCarry = (parentObj.registersHL > 0x7FFF);
		parentObj.registersHL = (parentObj.registersHL << 1) & 0xFFFF;
		parentObj.FSubtract = false;
	},
	//LDI A, (HL)
	//#0x2A:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.registersHL = (parentObj.registersHL + 1) & 0xFFFF;
	},
	//DEC HL
	//#0x2B:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL - 1) & 0xFFFF;
	},
	//INC L
	//#0x2C:
	function (parentObj) {
		var L = (parentObj.registersHL + 1) & 0xFF;
		parentObj.FZero = (L == 0);
		parentObj.FHalfCarry = ((L & 0xF) == 0);
		parentObj.FSubtract = false;
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | L;
	},
	//DEC L
	//#0x2D:
	function (parentObj) {
		var L = (parentObj.registersHL - 1) & 0xFF;
		parentObj.FZero = (L == 0);
		parentObj.FHalfCarry = ((L & 0xF) == 0xF);
		parentObj.FSubtract = true;
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | L;
	},
	//LD L, n
	//#0x2E:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
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
			parentObj.programCounter = (parentObj.programCounter + ((parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 24) >> 24) + 1) & 0xFFFF;
			parentObj.CPUTicks += 4;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		}
	},
	//LD SP, nn
	//#0x31:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//LDD (HL), A
	//#0x32:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registerA);
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
		var temp_var = (parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) + 1) & 0xFF;
		parentObj.FZero = (temp_var == 0);
		parentObj.FHalfCarry = ((temp_var & 0xF) == 0);
		parentObj.FSubtract = false;
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
	},
	//DEC (HL)
	//#0x35:
	function (parentObj) {
		var temp_var = (parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) - 1) & 0xFF;
		parentObj.FZero = (temp_var == 0);
		parentObj.FHalfCarry = ((temp_var & 0xF) == 0xF);
		parentObj.FSubtract = true;
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
	},
	//LD (HL), n
	//#0x36:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter));
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
			parentObj.programCounter = (parentObj.programCounter + ((parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 24) >> 24) + 1) & 0xFFFF;
			parentObj.CPUTicks += 4;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		}
	},
	//ADD HL, SP
	//#0x39:
	function (parentObj) {
		var dirtySum = parentObj.registersHL + parentObj.stackPointer;
		parentObj.FHalfCarry = ((parentObj.registersHL & 0xFFF) > (dirtySum & 0xFFF));
		parentObj.FCarry = (dirtySum > 0xFFFF);
		parentObj.registersHL = dirtySum & 0xFFFF;
		parentObj.FSubtract = false;
	},
	//LDD A, (HL)
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
		parentObj.registerA = (parentObj.registerA + 1) & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) == 0);
		parentObj.FSubtract = false;
	},
	//DEC A
	//#0x3D:
	function (parentObj) {
		parentObj.registerA = (parentObj.registerA - 1) & 0xFF;
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
		parentObj.registerB = parentObj.registersHL >> 8;
	},
	//LD B, L
	//#0x45:
	function (parentObj) {
		parentObj.registerB = parentObj.registersHL & 0xFF;
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
		parentObj.registerC = parentObj.registersHL >> 8;
	},
	//LD C, L
	//#0x4D:
	function (parentObj) {
		parentObj.registerC = parentObj.registersHL & 0xFF;
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
		parentObj.registerD = parentObj.registersHL >> 8;
	},
	//LD D, L
	//#0x55:
	function (parentObj) {
		parentObj.registerD = parentObj.registersHL & 0xFF;
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
		parentObj.registerE = parentObj.registersHL >> 8;
	},
	//LD E, L
	//#0x5D:
	function (parentObj) {
		parentObj.registerE = parentObj.registersHL & 0xFF;
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
		parentObj.registersHL = (parentObj.registerB << 8) | (parentObj.registersHL & 0xFF);
	},
	//LD H, C
	//#0x61:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerC << 8) | (parentObj.registersHL & 0xFF);
	},
	//LD H, D
	//#0x62:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerD << 8) | (parentObj.registersHL & 0xFF);
	},
	//LD H, E
	//#0x63:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerE << 8) | (parentObj.registersHL & 0xFF);
	},
	//LD H, H
	//#0x64:
	function (parentObj) {
		//Do nothing...
	},
	//LD H, L
	//#0x65:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF) * 0x101;
	},
	//LD H, (HL)
	//#0x66:
	function (parentObj) {
		parentObj.registersHL = (parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) << 8) | (parentObj.registersHL & 0xFF);
	},
	//LD H, A
	//#0x67:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registerA << 8) | (parentObj.registersHL & 0xFF);
	},
	//LD L, B
	//#0x68:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | parentObj.registerB;
	},
	//LD L, C
	//#0x69:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | parentObj.registerC;
	},
	//LD L, D
	//#0x6A:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | parentObj.registerD;
	},
	//LD L, E
	//#0x6B:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | parentObj.registerE;
	},
	//LD L, H
	//#0x6C:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | (parentObj.registersHL >> 8);
	},
	//LD L, L
	//#0x6D:
	function (parentObj) {
		//Do nothing...
	},
	//LD L, (HL)
	//#0x6E:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
	},
	//LD L, A
	//#0x6F:
	function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | parentObj.registerA;
	},
	//LD (HL), B
	//#0x70:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registerB);
	},
	//LD (HL), C
	//#0x71:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registerC);
	},
	//LD (HL), D
	//#0x72:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registerD);
	},
	//LD (HL), E
	//#0x73:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registerE);
	},
	//LD (HL), H
	//#0x74:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registersHL >> 8);
	},
	//LD (HL), L
	//#0x75:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registersHL & 0xFF);
	},
	//HALT
	//#0x76:
	function (parentObj) {
		//See if there's already an IRQ match:
		if ((parentObj.interruptsEnabled & parentObj.interruptsRequested & 0x1F) > 0) {
			if (!parentObj.cGBC && !parentObj.usedBootROM) {
				//HALT bug in the DMG CPU model (Program Counter fails to increment for one instruction after HALT):
				parentObj.skipPCIncrement = true;
			}
			else {
				//CGB gets around the HALT PC bug by doubling the hidden NOP.
				parentObj.CPUTicks += 4;
			}
		}
		else {
			//CPU is stalled until the next IRQ match:
			parentObj.calculateHALTPeriod();
		}
	},
	//LD (HL), A
	//#0x77:
	function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.registerA);
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
		parentObj.registerA = parentObj.registersHL >> 8;
	},
	//LD A, L
	//#0x7D:
	function (parentObj) {
		parentObj.registerA = parentObj.registersHL & 0xFF;
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
		parentObj.FHalfCarry = ((dirtySum & 0xF) < (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, C
	//#0x81:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerC;
		parentObj.FHalfCarry = ((dirtySum & 0xF) < (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, D
	//#0x82:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerD;
		parentObj.FHalfCarry = ((dirtySum & 0xF) < (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, E
	//#0x83:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.registerE;
		parentObj.FHalfCarry = ((dirtySum & 0xF) < (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, H
	//#0x84:
	function (parentObj) {
		var dirtySum = parentObj.registerA + (parentObj.registersHL >> 8);
		parentObj.FHalfCarry = ((dirtySum & 0xF) < (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, L
	//#0x85:
	function (parentObj) {
		var dirtySum = parentObj.registerA + (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = ((dirtySum & 0xF) < (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, (HL)
	//#0x86:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FHalfCarry = ((dirtySum & 0xF) < (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//ADD A, A
	//#0x87:
	function (parentObj) {
		parentObj.FHalfCarry = ((parentObj.registerA & 0x8) == 0x8);
		parentObj.FCarry = (parentObj.registerA > 0x7F);
		parentObj.registerA = (parentObj.registerA << 1) & 0xFF;
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
		//shift left register A one bit for some ops here as an optimization:
		var dirtySum = (parentObj.registerA << 1) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((((parentObj.registerA << 1) & 0x1E) | ((parentObj.FCarry) ? 1 : 0)) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//SUB A, B
	//#0x90:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerB;
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) < (dirtySum & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, C
	//#0x91:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerC;
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) < (dirtySum & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, D
	//#0x92:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerD;
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) < (dirtySum & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, E
	//#0x93:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerE;
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) < (dirtySum & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, H
	//#0x94:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL >> 8);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) < (dirtySum & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, L
	//#0x95:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) < (dirtySum & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//SUB A, (HL)
	//#0x96:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) < (dirtySum & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (dirtySum == 0);
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
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, C
	//#0x99:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerC - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registerC & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, D
	//#0x9A:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerD - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registerD & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, E
	//#0x9B:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerE - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registerE & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
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
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//SBC A, L
	//#0x9D:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL & 0xFF) - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (parentObj.registersHL & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
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
		parentObj.registerA = dirtySum & 0xFF;
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
		parentObj.registerA &= parentObj.registersHL;
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
		parentObj.FHalfCarry = ((dirtySum & 0xF) > (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP C
	//#0xB9:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerC;
		parentObj.FHalfCarry = ((dirtySum & 0xF) > (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP D
	//#0xBA:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerD;
		parentObj.FHalfCarry = ((dirtySum & 0xF) > (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP E
	//#0xBB:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.registerE;
		parentObj.FHalfCarry = ((dirtySum & 0xF) > (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP H
	//#0xBC:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL >> 8);
		parentObj.FHalfCarry = ((dirtySum & 0xF) > (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP L
	//#0xBD:
	function (parentObj) {
		var dirtySum = parentObj.registerA - (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = ((dirtySum & 0xF) > (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//CP (HL)
	//#0xBE:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FHalfCarry = ((dirtySum & 0xF) > (parentObj.registerA & 0xF));
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
			parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
			parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
			parentObj.CPUTicks += 12;
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
			parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.CPUTicks += 4;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//JP nn
	//#0xC3:
	function (parentObj) {
		parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
	},
	//CALL !FZ, nn
	//#0xC4:
	function (parentObj) {
		if (!parentObj.FZero) {
			var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
			parentObj.programCounter = temp_pc;
			parentObj.CPUTicks += 12;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//PUSH BC
	//#0xC5:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.registerB);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.registerC);
	},
	//ADD, n
	//#0xC6:
	function (parentObj) {
		var dirtySum = parentObj.registerA + parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FHalfCarry = ((dirtySum & 0xF) < (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//RST 0
	//#0xC7:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0;
	},
	//RET FZ
	//#0xC8:
	function (parentObj) {
		if (parentObj.FZero) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
			parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
			parentObj.CPUTicks += 12;
		}
	},
	//RET
	//#0xC9:
	function (parentObj) {
		parentObj.programCounter =  (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
	},
	//JP FZ, nn
	//#0xCA:
	function (parentObj) {
		if (parentObj.FZero) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.CPUTicks += 4;
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
		parentObj.CPUTicks += parentObj.SecondaryTICKTable[opcode];
		//Execute secondary OP codes for the 0xCB OP code call.
		parentObj.CBOPCODE[opcode](parentObj);
	},
	//CALL FZ, nn
	//#0xCC:
	function (parentObj) {
		if (parentObj.FZero) {
			var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
			parentObj.programCounter = temp_pc;
			parentObj.CPUTicks += 12;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//CALL nn
	//#0xCD:
	function (parentObj) {
		var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = temp_pc;
	},
	//ADC A, n
	//#0xCE:
	function (parentObj) {
		var tempValue = parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		var dirtySum = parentObj.registerA + tempValue + ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) + (tempValue & 0xF) + ((parentObj.FCarry) ? 1 : 0) > 0xF);
		parentObj.FCarry = (dirtySum > 0xFF);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = false;
	},
	//RST 0x8
	//#0xCF:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x8;
	},
	//RET !FC
	//#0xD0:
	function (parentObj) {
		if (!parentObj.FCarry) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
			parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
			parentObj.CPUTicks += 12;
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
			parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.CPUTicks += 4;
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
			var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
			parentObj.programCounter = temp_pc;
			parentObj.CPUTicks += 12;
		}
		else {
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
		}
	},
	//PUSH DE
	//#0xD5:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.registerD);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.registerE);
	},
	//SUB A, n
	//#0xD6:
	function (parentObj) {
		var dirtySum = parentObj.registerA - parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) < (dirtySum & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//RST 0x10
	//#0xD7:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x10;
	},
	//RET FC
	//#0xD8:
	function (parentObj) {
		if (parentObj.FCarry) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
			parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
			parentObj.CPUTicks += 12;
		}
	},
	//RETI
	//#0xD9:
	function (parentObj) {
		parentObj.programCounter = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
		//Immediate for HALT:
		parentObj.IRQEnableDelay = (parentObj.IRQEnableDelay == 2 || parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) == 0x76) ? 1 : 2;
	},
	//JP FC, nn
	//#0xDA:
	function (parentObj) {
		if (parentObj.FCarry) {
			parentObj.programCounter = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.CPUTicks += 4;
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
			var temp_pc = (parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter);
			parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
			parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
			parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
			parentObj.programCounter = temp_pc;
			parentObj.CPUTicks += 12;
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
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		var dirtySum = parentObj.registerA - temp_var - ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = ((parentObj.registerA & 0xF) - (temp_var & 0xF) - ((parentObj.FCarry) ? 1 : 0) < 0);
		parentObj.FCarry = (dirtySum < 0);
		parentObj.registerA = dirtySum & 0xFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = true;
	},
	//RST 0x18
	//#0xDF:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x18;
	},
	//LDH (n), A
	//#0xE0:
	function (parentObj) {
		parentObj.memoryHighWrite(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter), parentObj.registerA);
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//POP HL
	//#0xE1:
	function (parentObj) {
		parentObj.registersHL = (parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
	},
	//LD (0xFF00 + C), A
	//#0xE2:
	function (parentObj) {
		parentObj.memoryHighWriter[parentObj.registerC](parentObj, parentObj.registerC, parentObj.registerA);
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
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.registersHL >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.registersHL & 0xFF);
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
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x20;
	},
	//ADD SP, n
	//#0xE8:
	function (parentObj) {
		var temp_value2 = (parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 24) >> 24;
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		var temp_value = (parentObj.stackPointer + temp_value2) & 0xFFFF;
		temp_value2 = parentObj.stackPointer ^ temp_value2 ^ temp_value;
		parentObj.stackPointer = temp_value;
		parentObj.FCarry = ((temp_value2 & 0x100) == 0x100);
		parentObj.FHalfCarry = ((temp_value2 & 0x10) == 0x10);
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
		parentObj.memoryWrite((parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter), parentObj.registerA);
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
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FSubtract = parentObj.FHalfCarry = parentObj.FCarry = false;
	},
	//RST 0x28
	//#0xEF:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x28;
	},
	//LDH A, (n)
	//#0xF0:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryHighRead(parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter));
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
	},
	//POP AF
	//#0xF1:
	function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.stackPointer](parentObj, parentObj.stackPointer);
		parentObj.FZero = (temp_var > 0x7F);
		parentObj.FSubtract = ((temp_var & 0x40) == 0x40);
		parentObj.FHalfCarry = ((temp_var & 0x20) == 0x20);
		parentObj.FCarry = ((temp_var & 0x10) == 0x10);
		parentObj.registerA = parentObj.memoryRead((parentObj.stackPointer + 1) & 0xFFFF);
		parentObj.stackPointer = (parentObj.stackPointer + 2) & 0xFFFF;
	},
	//LD A, (0xFF00 + C)
	//#0xF2:
	function (parentObj) {
		parentObj.registerA = parentObj.memoryHighReader[parentObj.registerC](parentObj, parentObj.registerC);
	},
	//DI
	//#0xF3:
	function (parentObj) {
		parentObj.IME = false;
		parentObj.IRQEnableDelay = 0;
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
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.registerA);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, ((parentObj.FZero) ? 0x80 : 0) | ((parentObj.FSubtract) ? 0x40 : 0) | ((parentObj.FHalfCarry) ? 0x20 : 0) | ((parentObj.FCarry) ? 0x10 : 0));
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
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x30;
	},
	//LDHL SP, n
	//#0xF8:
	function (parentObj) {
		var temp_var = (parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) << 24) >> 24;
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.registersHL = (parentObj.stackPointer + temp_var) & 0xFFFF;
		temp_var = parentObj.stackPointer ^ temp_var ^ parentObj.registersHL;
		parentObj.FCarry = ((temp_var & 0x100) == 0x100);
		parentObj.FHalfCarry = ((temp_var & 0x10) == 0x10);
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
		parentObj.registerA = parentObj.memoryRead((parentObj.memoryRead((parentObj.programCounter + 1) & 0xFFFF) << 8) | parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter));
		parentObj.programCounter = (parentObj.programCounter + 2) & 0xFFFF;
	},
	//EI
	//#0xFB:
	function (parentObj) {
		//Immediate for HALT:
		parentObj.IRQEnableDelay = (parentObj.IRQEnableDelay == 2 || parentObj.memoryReader[parentObj.programCounter](parentObj, parentObj.programCounter) == 0x76) ? 1 : 2;
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
		parentObj.programCounter = (parentObj.programCounter + 1) & 0xFFFF;
		parentObj.FHalfCarry = ((dirtySum & 0xF) > (parentObj.registerA & 0xF));
		parentObj.FCarry = (dirtySum < 0);
		parentObj.FZero = (dirtySum == 0);
		parentObj.FSubtract = true;
	},
	//RST 0x38
	//#0xFF:
	function (parentObj) {
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter >> 8);
		parentObj.stackPointer = (parentObj.stackPointer - 1) & 0xFFFF;
		parentObj.memoryWriter[parentObj.stackPointer](parentObj, parentObj.stackPointer, parentObj.programCounter & 0xFF);
		parentObj.programCounter = 0x38;
	}
];
GameBoyCore.prototype.CBOPCODE = [
	//RLC B
	//#0x00:
	function (parentObj) {
		parentObj.FCarry = (parentObj.registerB > 0x7F);
		parentObj.registerB = ((parentObj.registerB << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//RLC C
	//#0x01:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerC > 0x7F);
		parentObj.registerC = ((parentObj.registerC << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//RLC D
	//#0x02:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerD > 0x7F);
		parentObj.registerD = ((parentObj.registerD << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//RLC E
	//#0x03:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerE > 0x7F);
		parentObj.registerE = ((parentObj.registerE << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//RLC H
	//#0x04:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registersHL > 0x7FFF);
		parentObj.registersHL = ((parentObj.registersHL << 1) & 0xFE00) | ((parentObj.FCarry) ? 0x100 : 0) | (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL < 0x100);
	}
	//RLC L
	//#0x05:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x80) == 0x80);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | ((parentObj.registersHL << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
	}
	//RLC (HL)
	//#0x06:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = (temp_var > 0x7F);
		temp_var = ((temp_var << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0);
	}
	//RLC A
	//#0x07:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerA > 0x7F);
		parentObj.registerA = ((parentObj.registerA << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0);
	}
	//RRC B
	//#0x08:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerB & 0x01) == 0x01);
		parentObj.registerB = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerB >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//RRC C
	//#0x09:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerC & 0x01) == 0x01);
		parentObj.registerC = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerC >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//RRC D
	//#0x0A:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerD & 0x01) == 0x01);
		parentObj.registerD = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerD >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//RRC E
	//#0x0B:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerE & 0x01) == 0x01);
		parentObj.registerE = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerE >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//RRC H
	//#0x0C:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0100) == 0x0100);
		parentObj.registersHL = ((parentObj.FCarry) ? 0x8000 : 0) | ((parentObj.registersHL >> 1) & 0xFF00) | (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL < 0x100);
	}
	//RRC L
	//#0x0D:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x01) == 0x01);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | ((parentObj.FCarry) ? 0x80 : 0) | ((parentObj.registersHL & 0xFF) >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
	}
	//RRC (HL)
	//#0x0E:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = ((temp_var & 0x01) == 0x01);
		temp_var = ((parentObj.FCarry) ? 0x80 : 0) | (temp_var >> 1);
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0);
	}
	//RRC A
	//#0x0F:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x01) == 0x01);
		parentObj.registerA = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerA >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0);
	}
	//RL B
	//#0x10:
	,function (parentObj) {
		var newFCarry = (parentObj.registerB > 0x7F);
		parentObj.registerB = ((parentObj.registerB << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//RL C
	//#0x11:
	,function (parentObj) {
		var newFCarry = (parentObj.registerC > 0x7F);
		parentObj.registerC = ((parentObj.registerC << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//RL D
	//#0x12:
	,function (parentObj) {
		var newFCarry = (parentObj.registerD > 0x7F);
		parentObj.registerD = ((parentObj.registerD << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//RL E
	//#0x13:
	,function (parentObj) {
		var newFCarry = (parentObj.registerE > 0x7F);
		parentObj.registerE = ((parentObj.registerE << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//RL H
	//#0x14:
	,function (parentObj) {
		var newFCarry = (parentObj.registersHL > 0x7FFF);
		parentObj.registersHL = ((parentObj.registersHL << 1) & 0xFE00) | ((parentObj.FCarry) ? 0x100 : 0) | (parentObj.registersHL & 0xFF);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL < 0x100);
	}
	//RL L
	//#0x15:
	,function (parentObj) {
		var newFCarry = ((parentObj.registersHL & 0x80) == 0x80);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | ((parentObj.registersHL << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
	}
	//RL (HL)
	//#0x16:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		var newFCarry = (temp_var > 0x7F);
		temp_var = ((temp_var << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0);
	}
	//RL A
	//#0x17:
	,function (parentObj) {
		var newFCarry = (parentObj.registerA > 0x7F);
		parentObj.registerA = ((parentObj.registerA << 1) & 0xFF) | ((parentObj.FCarry) ? 1 : 0);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0);
	}
	//RR B
	//#0x18:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerB & 0x01) == 0x01);
		parentObj.registerB = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerB >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//RR C
	//#0x19:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerC & 0x01) == 0x01);
		parentObj.registerC = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerC >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//RR D
	//#0x1A:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerD & 0x01) == 0x01);
		parentObj.registerD = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerD >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//RR E
	//#0x1B:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerE & 0x01) == 0x01);
		parentObj.registerE = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerE >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//RR H
	//#0x1C:
	,function (parentObj) {
		var newFCarry = ((parentObj.registersHL & 0x0100) == 0x0100);
		parentObj.registersHL = ((parentObj.FCarry) ? 0x8000 : 0) | ((parentObj.registersHL >> 1) & 0xFF00) | (parentObj.registersHL & 0xFF);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL < 0x100);
	}
	//RR L
	//#0x1D:
	,function (parentObj) {
		var newFCarry = ((parentObj.registersHL & 0x01) == 0x01);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | ((parentObj.FCarry) ? 0x80 : 0) | ((parentObj.registersHL & 0xFF) >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
	}
	//RR (HL)
	//#0x1E:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		var newFCarry = ((temp_var & 0x01) == 0x01);
		temp_var = ((parentObj.FCarry) ? 0x80 : 0) | (temp_var >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0);
	}
	//RR A
	//#0x1F:
	,function (parentObj) {
		var newFCarry = ((parentObj.registerA & 0x01) == 0x01);
		parentObj.registerA = ((parentObj.FCarry) ? 0x80 : 0) | (parentObj.registerA >> 1);
		parentObj.FCarry = newFCarry;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0);
	}
	//SLA B
	//#0x20:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerB > 0x7F);
		parentObj.registerB = (parentObj.registerB << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//SLA C
	//#0x21:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerC > 0x7F);
		parentObj.registerC = (parentObj.registerC << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//SLA D
	//#0x22:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerD > 0x7F);
		parentObj.registerD = (parentObj.registerD << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//SLA E
	//#0x23:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerE > 0x7F);
		parentObj.registerE = (parentObj.registerE << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//SLA H
	//#0x24:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registersHL > 0x7FFF);
		parentObj.registersHL = ((parentObj.registersHL << 1) & 0xFE00) | (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL < 0x100);
	}
	//SLA L
	//#0x25:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0080) == 0x0080);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | ((parentObj.registersHL << 1) & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
	}
	//SLA (HL)
	//#0x26:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = (temp_var > 0x7F);
		temp_var = (temp_var << 1) & 0xFF;
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0);
	}
	//SLA A
	//#0x27:
	,function (parentObj) {
		parentObj.FCarry = (parentObj.registerA > 0x7F);
		parentObj.registerA = (parentObj.registerA << 1) & 0xFF;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0);
	}
	//SRA B
	//#0x28:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerB & 0x01) == 0x01);
		parentObj.registerB = (parentObj.registerB & 0x80) | (parentObj.registerB >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//SRA C
	//#0x29:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerC & 0x01) == 0x01);
		parentObj.registerC = (parentObj.registerC & 0x80) | (parentObj.registerC >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//SRA D
	//#0x2A:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerD & 0x01) == 0x01);
		parentObj.registerD = (parentObj.registerD & 0x80) | (parentObj.registerD >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//SRA E
	//#0x2B:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerE & 0x01) == 0x01);
		parentObj.registerE = (parentObj.registerE & 0x80) | (parentObj.registerE >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//SRA H
	//#0x2C:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0100) == 0x0100);
		parentObj.registersHL = ((parentObj.registersHL >> 1) & 0xFF00) | (parentObj.registersHL & 0x80FF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL < 0x100);
	}
	//SRA L
	//#0x2D:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0001) == 0x0001);
		parentObj.registersHL = (parentObj.registersHL & 0xFF80) | ((parentObj.registersHL & 0xFF) >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
	}
	//SRA (HL)
	//#0x2E:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = ((temp_var & 0x01) == 0x01);
		temp_var = (temp_var & 0x80) | (temp_var >> 1);
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var == 0);
	}
	//SRA A
	//#0x2F:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x01) == 0x01);
		parentObj.registerA = (parentObj.registerA & 0x80) | (parentObj.registerA >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0);
	}
	//SWAP B
	//#0x30:
	,function (parentObj) {
		parentObj.registerB = ((parentObj.registerB & 0xF) << 4) | (parentObj.registerB >> 4);
		parentObj.FZero = (parentObj.registerB == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//SWAP C
	//#0x31:
	,function (parentObj) {
		parentObj.registerC = ((parentObj.registerC & 0xF) << 4) | (parentObj.registerC >> 4);
		parentObj.FZero = (parentObj.registerC == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//SWAP D
	//#0x32:
	,function (parentObj) {
		parentObj.registerD = ((parentObj.registerD & 0xF) << 4) | (parentObj.registerD >> 4);
		parentObj.FZero = (parentObj.registerD == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//SWAP E
	//#0x33:
	,function (parentObj) {
		parentObj.registerE = ((parentObj.registerE & 0xF) << 4) | (parentObj.registerE >> 4);
		parentObj.FZero = (parentObj.registerE == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//SWAP H
	//#0x34:
	,function (parentObj) {
		parentObj.registersHL = ((parentObj.registersHL & 0xF00) << 4) | ((parentObj.registersHL & 0xF000) >> 4) | (parentObj.registersHL & 0xFF);
		parentObj.FZero = (parentObj.registersHL < 0x100);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//SWAP L
	//#0x35:
	,function (parentObj) {
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | ((parentObj.registersHL & 0xF) << 4) | ((parentObj.registersHL & 0xF0) >> 4);
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//SWAP (HL)
	//#0x36:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		temp_var = ((temp_var & 0xF) << 4) | (temp_var >> 4);
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var);
		parentObj.FZero = (temp_var == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//SWAP A
	//#0x37:
	,function (parentObj) {
		parentObj.registerA = ((parentObj.registerA & 0xF) << 4) | (parentObj.registerA >> 4);
		parentObj.FZero = (parentObj.registerA == 0);
		parentObj.FCarry = parentObj.FHalfCarry = parentObj.FSubtract = false;
	}
	//SRL B
	//#0x38:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerB & 0x01) == 0x01);
		parentObj.registerB >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerB == 0);
	}
	//SRL C
	//#0x39:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerC & 0x01) == 0x01);
		parentObj.registerC >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerC == 0);
	}
	//SRL D
	//#0x3A:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerD & 0x01) == 0x01);
		parentObj.registerD >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerD == 0);
	}
	//SRL E
	//#0x3B:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerE & 0x01) == 0x01);
		parentObj.registerE >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerE == 0);
	}
	//SRL H
	//#0x3C:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0100) == 0x0100);
		parentObj.registersHL = ((parentObj.registersHL >> 1) & 0xFF00) | (parentObj.registersHL & 0xFF);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registersHL < 0x100);
	}
	//SRL L
	//#0x3D:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registersHL & 0x0001) == 0x0001);
		parentObj.registersHL = (parentObj.registersHL & 0xFF00) | ((parentObj.registersHL & 0xFF) >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0xFF) == 0);
	}
	//SRL (HL)
	//#0x3E:
	,function (parentObj) {
		var temp_var = parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL);
		parentObj.FCarry = ((temp_var & 0x01) == 0x01);
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, temp_var >> 1);
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (temp_var < 2);
	}
	//SRL A
	//#0x3F:
	,function (parentObj) {
		parentObj.FCarry = ((parentObj.registerA & 0x01) == 0x01);
		parentObj.registerA >>= 1;
		parentObj.FHalfCarry = parentObj.FSubtract = false;
		parentObj.FZero = (parentObj.registerA == 0);
	}
	//BIT 0, B
	//#0x40:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x01) == 0);
	}
	//BIT 0, C
	//#0x41:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x01) == 0);
	}
	//BIT 0, D
	//#0x42:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x01) == 0);
	}
	//BIT 0, E
	//#0x43:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x01) == 0);
	}
	//BIT 0, H
	//#0x44:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0100) == 0);
	}
	//BIT 0, L
	//#0x45:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0001) == 0);
	}
	//BIT 0, (HL)
	//#0x46:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x01) == 0);
	}
	//BIT 0, A
	//#0x47:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x01) == 0);
	}
	//BIT 1, B
	//#0x48:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x02) == 0);
	}
	//BIT 1, C
	//#0x49:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x02) == 0);
	}
	//BIT 1, D
	//#0x4A:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x02) == 0);
	}
	//BIT 1, E
	//#0x4B:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x02) == 0);
	}
	//BIT 1, H
	//#0x4C:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0200) == 0);
	}
	//BIT 1, L
	//#0x4D:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0002) == 0);
	}
	//BIT 1, (HL)
	//#0x4E:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x02) == 0);
	}
	//BIT 1, A
	//#0x4F:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x02) == 0);
	}
	//BIT 2, B
	//#0x50:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x04) == 0);
	}
	//BIT 2, C
	//#0x51:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x04) == 0);
	}
	//BIT 2, D
	//#0x52:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x04) == 0);
	}
	//BIT 2, E
	//#0x53:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x04) == 0);
	}
	//BIT 2, H
	//#0x54:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0400) == 0);
	}
	//BIT 2, L
	//#0x55:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0004) == 0);
	}
	//BIT 2, (HL)
	//#0x56:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x04) == 0);
	}
	//BIT 2, A
	//#0x57:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x04) == 0);
	}
	//BIT 3, B
	//#0x58:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x08) == 0);
	}
	//BIT 3, C
	//#0x59:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x08) == 0);
	}
	//BIT 3, D
	//#0x5A:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x08) == 0);
	}
	//BIT 3, E
	//#0x5B:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x08) == 0);
	}
	//BIT 3, H
	//#0x5C:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0800) == 0);
	}
	//BIT 3, L
	//#0x5D:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0008) == 0);
	}
	//BIT 3, (HL)
	//#0x5E:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x08) == 0);
	}
	//BIT 3, A
	//#0x5F:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x08) == 0);
	}
	//BIT 4, B
	//#0x60:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x10) == 0);
	}
	//BIT 4, C
	//#0x61:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x10) == 0);
	}
	//BIT 4, D
	//#0x62:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x10) == 0);
	}
	//BIT 4, E
	//#0x63:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x10) == 0);
	}
	//BIT 4, H
	//#0x64:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x1000) == 0);
	}
	//BIT 4, L
	//#0x65:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0010) == 0);
	}
	//BIT 4, (HL)
	//#0x66:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x10) == 0);
	}
	//BIT 4, A
	//#0x67:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x10) == 0);
	}
	//BIT 5, B
	//#0x68:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x20) == 0);
	}
	//BIT 5, C
	//#0x69:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x20) == 0);
	}
	//BIT 5, D
	//#0x6A:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x20) == 0);
	}
	//BIT 5, E
	//#0x6B:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x20) == 0);
	}
	//BIT 5, H
	//#0x6C:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x2000) == 0);
	}
	//BIT 5, L
	//#0x6D:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0020) == 0);
	}
	//BIT 5, (HL)
	//#0x6E:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x20) == 0);
	}
	//BIT 5, A
	//#0x6F:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x20) == 0);
	}
	//BIT 6, B
	//#0x70:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x40) == 0);
	}
	//BIT 6, C
	//#0x71:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x40) == 0);
	}
	//BIT 6, D
	//#0x72:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x40) == 0);
	}
	//BIT 6, E
	//#0x73:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x40) == 0);
	}
	//BIT 6, H
	//#0x74:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x4000) == 0);
	}
	//BIT 6, L
	//#0x75:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0040) == 0);
	}
	//BIT 6, (HL)
	//#0x76:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x40) == 0);
	}
	//BIT 6, A
	//#0x77:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x40) == 0);
	}
	//BIT 7, B
	//#0x78:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerB & 0x80) == 0);
	}
	//BIT 7, C
	//#0x79:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerC & 0x80) == 0);
	}
	//BIT 7, D
	//#0x7A:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerD & 0x80) == 0);
	}
	//BIT 7, E
	//#0x7B:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerE & 0x80) == 0);
	}
	//BIT 7, H
	//#0x7C:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x8000) == 0);
	}
	//BIT 7, L
	//#0x7D:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registersHL & 0x0080) == 0);
	}
	//BIT 7, (HL)
	//#0x7E:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x80) == 0);
	}
	//BIT 7, A
	//#0x7F:
	,function (parentObj) {
		parentObj.FHalfCarry = true;
		parentObj.FSubtract = false;
		parentObj.FZero = ((parentObj.registerA & 0x80) == 0);
	}
	//RES 0, B
	//#0x80:
	,function (parentObj) {
		parentObj.registerB &= 0xFE;
	}
	//RES 0, C
	//#0x81:
	,function (parentObj) {
		parentObj.registerC &= 0xFE;
	}
	//RES 0, D
	//#0x82:
	,function (parentObj) {
		parentObj.registerD &= 0xFE;
	}
	//RES 0, E
	//#0x83:
	,function (parentObj) {
		parentObj.registerE &= 0xFE;
	}
	//RES 0, H
	//#0x84:
	,function (parentObj) {
		parentObj.registersHL &= 0xFEFF;
	}
	//RES 0, L
	//#0x85:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFFE;
	}
	//RES 0, (HL)
	//#0x86:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xFE);
	}
	//RES 0, A
	//#0x87:
	,function (parentObj) {
		parentObj.registerA &= 0xFE;
	}
	//RES 1, B
	//#0x88:
	,function (parentObj) {
		parentObj.registerB &= 0xFD;
	}
	//RES 1, C
	//#0x89:
	,function (parentObj) {
		parentObj.registerC &= 0xFD;
	}
	//RES 1, D
	//#0x8A:
	,function (parentObj) {
		parentObj.registerD &= 0xFD;
	}
	//RES 1, E
	//#0x8B:
	,function (parentObj) {
		parentObj.registerE &= 0xFD;
	}
	//RES 1, H
	//#0x8C:
	,function (parentObj) {
		parentObj.registersHL &= 0xFDFF;
	}
	//RES 1, L
	//#0x8D:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFFD;
	}
	//RES 1, (HL)
	//#0x8E:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xFD);
	}
	//RES 1, A
	//#0x8F:
	,function (parentObj) {
		parentObj.registerA &= 0xFD;
	}
	//RES 2, B
	//#0x90:
	,function (parentObj) {
		parentObj.registerB &= 0xFB;
	}
	//RES 2, C
	//#0x91:
	,function (parentObj) {
		parentObj.registerC &= 0xFB;
	}
	//RES 2, D
	//#0x92:
	,function (parentObj) {
		parentObj.registerD &= 0xFB;
	}
	//RES 2, E
	//#0x93:
	,function (parentObj) {
		parentObj.registerE &= 0xFB;
	}
	//RES 2, H
	//#0x94:
	,function (parentObj) {
		parentObj.registersHL &= 0xFBFF;
	}
	//RES 2, L
	//#0x95:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFFB;
	}
	//RES 2, (HL)
	//#0x96:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xFB);
	}
	//RES 2, A
	//#0x97:
	,function (parentObj) {
		parentObj.registerA &= 0xFB;
	}
	//RES 3, B
	//#0x98:
	,function (parentObj) {
		parentObj.registerB &= 0xF7;
	}
	//RES 3, C
	//#0x99:
	,function (parentObj) {
		parentObj.registerC &= 0xF7;
	}
	//RES 3, D
	//#0x9A:
	,function (parentObj) {
		parentObj.registerD &= 0xF7;
	}
	//RES 3, E
	//#0x9B:
	,function (parentObj) {
		parentObj.registerE &= 0xF7;
	}
	//RES 3, H
	//#0x9C:
	,function (parentObj) {
		parentObj.registersHL &= 0xF7FF;
	}
	//RES 3, L
	//#0x9D:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFF7;
	}
	//RES 3, (HL)
	//#0x9E:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xF7);
	}
	//RES 3, A
	//#0x9F:
	,function (parentObj) {
		parentObj.registerA &= 0xF7;
	}
	//RES 3, B
	//#0xA0:
	,function (parentObj) {
		parentObj.registerB &= 0xEF;
	}
	//RES 4, C
	//#0xA1:
	,function (parentObj) {
		parentObj.registerC &= 0xEF;
	}
	//RES 4, D
	//#0xA2:
	,function (parentObj) {
		parentObj.registerD &= 0xEF;
	}
	//RES 4, E
	//#0xA3:
	,function (parentObj) {
		parentObj.registerE &= 0xEF;
	}
	//RES 4, H
	//#0xA4:
	,function (parentObj) {
		parentObj.registersHL &= 0xEFFF;
	}
	//RES 4, L
	//#0xA5:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFEF;
	}
	//RES 4, (HL)
	//#0xA6:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xEF);
	}
	//RES 4, A
	//#0xA7:
	,function (parentObj) {
		parentObj.registerA &= 0xEF;
	}
	//RES 5, B
	//#0xA8:
	,function (parentObj) {
		parentObj.registerB &= 0xDF;
	}
	//RES 5, C
	//#0xA9:
	,function (parentObj) {
		parentObj.registerC &= 0xDF;
	}
	//RES 5, D
	//#0xAA:
	,function (parentObj) {
		parentObj.registerD &= 0xDF;
	}
	//RES 5, E
	//#0xAB:
	,function (parentObj) {
		parentObj.registerE &= 0xDF;
	}
	//RES 5, H
	//#0xAC:
	,function (parentObj) {
		parentObj.registersHL &= 0xDFFF;
	}
	//RES 5, L
	//#0xAD:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFDF;
	}
	//RES 5, (HL)
	//#0xAE:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xDF);
	}
	//RES 5, A
	//#0xAF:
	,function (parentObj) {
		parentObj.registerA &= 0xDF;
	}
	//RES 6, B
	//#0xB0:
	,function (parentObj) {
		parentObj.registerB &= 0xBF;
	}
	//RES 6, C
	//#0xB1:
	,function (parentObj) {
		parentObj.registerC &= 0xBF;
	}
	//RES 6, D
	//#0xB2:
	,function (parentObj) {
		parentObj.registerD &= 0xBF;
	}
	//RES 6, E
	//#0xB3:
	,function (parentObj) {
		parentObj.registerE &= 0xBF;
	}
	//RES 6, H
	//#0xB4:
	,function (parentObj) {
		parentObj.registersHL &= 0xBFFF;
	}
	//RES 6, L
	//#0xB5:
	,function (parentObj) {
		parentObj.registersHL &= 0xFFBF;
	}
	//RES 6, (HL)
	//#0xB6:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0xBF);
	}
	//RES 6, A
	//#0xB7:
	,function (parentObj) {
		parentObj.registerA &= 0xBF;
	}
	//RES 7, B
	//#0xB8:
	,function (parentObj) {
		parentObj.registerB &= 0x7F;
	}
	//RES 7, C
	//#0xB9:
	,function (parentObj) {
		parentObj.registerC &= 0x7F;
	}
	//RES 7, D
	//#0xBA:
	,function (parentObj) {
		parentObj.registerD &= 0x7F;
	}
	//RES 7, E
	//#0xBB:
	,function (parentObj) {
		parentObj.registerE &= 0x7F;
	}
	//RES 7, H
	//#0xBC:
	,function (parentObj) {
		parentObj.registersHL &= 0x7FFF;
	}
	//RES 7, L
	//#0xBD:
	,function (parentObj) {
		parentObj.registersHL &= 0xFF7F;
	}
	//RES 7, (HL)
	//#0xBE:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) & 0x7F);
	}
	//RES 7, A
	//#0xBF:
	,function (parentObj) {
		parentObj.registerA &= 0x7F;
	}
	//SET 0, B
	//#0xC0:
	,function (parentObj) {
		parentObj.registerB |= 0x01;
	}
	//SET 0, C
	//#0xC1:
	,function (parentObj) {
		parentObj.registerC |= 0x01;
	}
	//SET 0, D
	//#0xC2:
	,function (parentObj) {
		parentObj.registerD |= 0x01;
	}
	//SET 0, E
	//#0xC3:
	,function (parentObj) {
		parentObj.registerE |= 0x01;
	}
	//SET 0, H
	//#0xC4:
	,function (parentObj) {
		parentObj.registersHL |= 0x0100;
	}
	//SET 0, L
	//#0xC5:
	,function (parentObj) {
		parentObj.registersHL |= 0x01;
	}
	//SET 0, (HL)
	//#0xC6:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x01);
	}
	//SET 0, A
	//#0xC7:
	,function (parentObj) {
		parentObj.registerA |= 0x01;
	}
	//SET 1, B
	//#0xC8:
	,function (parentObj) {
		parentObj.registerB |= 0x02;
	}
	//SET 1, C
	//#0xC9:
	,function (parentObj) {
		parentObj.registerC |= 0x02;
	}
	//SET 1, D
	//#0xCA:
	,function (parentObj) {
		parentObj.registerD |= 0x02;
	}
	//SET 1, E
	//#0xCB:
	,function (parentObj) {
		parentObj.registerE |= 0x02;
	}
	//SET 1, H
	//#0xCC:
	,function (parentObj) {
		parentObj.registersHL |= 0x0200;
	}
	//SET 1, L
	//#0xCD:
	,function (parentObj) {
		parentObj.registersHL |= 0x02;
	}
	//SET 1, (HL)
	//#0xCE:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x02);
	}
	//SET 1, A
	//#0xCF:
	,function (parentObj) {
		parentObj.registerA |= 0x02;
	}
	//SET 2, B
	//#0xD0:
	,function (parentObj) {
		parentObj.registerB |= 0x04;
	}
	//SET 2, C
	//#0xD1:
	,function (parentObj) {
		parentObj.registerC |= 0x04;
	}
	//SET 2, D
	//#0xD2:
	,function (parentObj) {
		parentObj.registerD |= 0x04;
	}
	//SET 2, E
	//#0xD3:
	,function (parentObj) {
		parentObj.registerE |= 0x04;
	}
	//SET 2, H
	//#0xD4:
	,function (parentObj) {
		parentObj.registersHL |= 0x0400;
	}
	//SET 2, L
	//#0xD5:
	,function (parentObj) {
		parentObj.registersHL |= 0x04;
	}
	//SET 2, (HL)
	//#0xD6:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x04);
	}
	//SET 2, A
	//#0xD7:
	,function (parentObj) {
		parentObj.registerA |= 0x04;
	}
	//SET 3, B
	//#0xD8:
	,function (parentObj) {
		parentObj.registerB |= 0x08;
	}
	//SET 3, C
	//#0xD9:
	,function (parentObj) {
		parentObj.registerC |= 0x08;
	}
	//SET 3, D
	//#0xDA:
	,function (parentObj) {
		parentObj.registerD |= 0x08;
	}
	//SET 3, E
	//#0xDB:
	,function (parentObj) {
		parentObj.registerE |= 0x08;
	}
	//SET 3, H
	//#0xDC:
	,function (parentObj) {
		parentObj.registersHL |= 0x0800;
	}
	//SET 3, L
	//#0xDD:
	,function (parentObj) {
		parentObj.registersHL |= 0x08;
	}
	//SET 3, (HL)
	//#0xDE:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x08);
	}
	//SET 3, A
	//#0xDF:
	,function (parentObj) {
		parentObj.registerA |= 0x08;
	}
	//SET 4, B
	//#0xE0:
	,function (parentObj) {
		parentObj.registerB |= 0x10;
	}
	//SET 4, C
	//#0xE1:
	,function (parentObj) {
		parentObj.registerC |= 0x10;
	}
	//SET 4, D
	//#0xE2:
	,function (parentObj) {
		parentObj.registerD |= 0x10;
	}
	//SET 4, E
	//#0xE3:
	,function (parentObj) {
		parentObj.registerE |= 0x10;
	}
	//SET 4, H
	//#0xE4:
	,function (parentObj) {
		parentObj.registersHL |= 0x1000;
	}
	//SET 4, L
	//#0xE5:
	,function (parentObj) {
		parentObj.registersHL |= 0x10;
	}
	//SET 4, (HL)
	//#0xE6:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x10);
	}
	//SET 4, A
	//#0xE7:
	,function (parentObj) {
		parentObj.registerA |= 0x10;
	}
	//SET 5, B
	//#0xE8:
	,function (parentObj) {
		parentObj.registerB |= 0x20;
	}
	//SET 5, C
	//#0xE9:
	,function (parentObj) {
		parentObj.registerC |= 0x20;
	}
	//SET 5, D
	//#0xEA:
	,function (parentObj) {
		parentObj.registerD |= 0x20;
	}
	//SET 5, E
	//#0xEB:
	,function (parentObj) {
		parentObj.registerE |= 0x20;
	}
	//SET 5, H
	//#0xEC:
	,function (parentObj) {
		parentObj.registersHL |= 0x2000;
	}
	//SET 5, L
	//#0xED:
	,function (parentObj) {
		parentObj.registersHL |= 0x20;
	}
	//SET 5, (HL)
	//#0xEE:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x20);
	}
	//SET 5, A
	//#0xEF:
	,function (parentObj) {
		parentObj.registerA |= 0x20;
	}
	//SET 6, B
	//#0xF0:
	,function (parentObj) {
		parentObj.registerB |= 0x40;
	}
	//SET 6, C
	//#0xF1:
	,function (parentObj) {
		parentObj.registerC |= 0x40;
	}
	//SET 6, D
	//#0xF2:
	,function (parentObj) {
		parentObj.registerD |= 0x40;
	}
	//SET 6, E
	//#0xF3:
	,function (parentObj) {
		parentObj.registerE |= 0x40;
	}
	//SET 6, H
	//#0xF4:
	,function (parentObj) {
		parentObj.registersHL |= 0x4000;
	}
	//SET 6, L
	//#0xF5:
	,function (parentObj) {
		parentObj.registersHL |= 0x40;
	}
	//SET 6, (HL)
	//#0xF6:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x40);
	}
	//SET 6, A
	//#0xF7:
	,function (parentObj) {
		parentObj.registerA |= 0x40;
	}
	//SET 7, B
	//#0xF8:
	,function (parentObj) {
		parentObj.registerB |= 0x80;
	}
	//SET 7, C
	//#0xF9:
	,function (parentObj) {
		parentObj.registerC |= 0x80;
	}
	//SET 7, D
	//#0xFA:
	,function (parentObj) {
		parentObj.registerD |= 0x80;
	}
	//SET 7, E
	//#0xFB:
	,function (parentObj) {
		parentObj.registerE |= 0x80;
	}
	//SET 7, H
	//#0xFC:
	,function (parentObj) {
		parentObj.registersHL |= 0x8000;
	}
	//SET 7, L
	//#0xFD:
	,function (parentObj) {
		parentObj.registersHL |= 0x80;
	}
	//SET 7, (HL)
	//#0xFE:
	,function (parentObj) {
		parentObj.memoryWriter[parentObj.registersHL](parentObj, parentObj.registersHL, parentObj.memoryReader[parentObj.registersHL](parentObj, parentObj.registersHL) | 0x80);
	}
	//SET 7, A
	//#0xFF:
	,function (parentObj) {
		parentObj.registerA |= 0x80;
	}
];
GameBoyCore.prototype.TICKTable = [		//Number of machine cycles for each instruction:
/*   0,  1,  2,  3,  4,  5,  6,  7,      8,  9,  A, B,  C,  D, E,  F*/
     4, 12,  8,  8,  4,  4,  8,  4,     20,  8,  8, 8,  4,  4, 8,  4,  //0
     4, 12,  8,  8,  4,  4,  8,  4,     12,  8,  8, 8,  4,  4, 8,  4,  //1
     8, 12,  8,  8,  4,  4,  8,  4,      8,  8,  8, 8,  4,  4, 8,  4,  //2
     8, 12,  8,  8, 12, 12, 12,  4,      8,  8,  8, 8,  4,  4, 8,  4,  //3

     4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //4
     4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //5
     4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //6
     8,  8,  8,  8,  8,  8,  4,  8,      4,  4,  4, 4,  4,  4, 8,  4,  //7

     4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //8
     4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //9
     4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //A
     4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //B

     8, 12, 12, 16, 12, 16,  8, 16,      8, 16, 12, 0, 12, 24, 8, 16,  //C
     8, 12, 12,  4, 12, 16,  8, 16,      8, 16, 12, 4, 12,  4, 8, 16,  //D
    12, 12,  8,  4,  4, 16,  8, 16,     16,  4, 16, 4,  4,  4, 8, 16,  //E
    12, 12,  8,  4,  4, 16,  8, 16,     12,  8, 16, 4,  0,  4, 8, 16   //F
];
GameBoyCore.prototype.SecondaryTICKTable = [	//Number of machine cycles for each 0xCBXX instruction:
/*  0, 1, 2, 3, 4, 5,  6, 7,        8, 9, A, B, C, D,  E, F*/
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //0
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //1
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //2
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //3

    8, 8, 8, 8, 8, 8, 12, 8,        8, 8, 8, 8, 8, 8, 12, 8,  //4
    8, 8, 8, 8, 8, 8, 12, 8,        8, 8, 8, 8, 8, 8, 12, 8,  //5
    8, 8, 8, 8, 8, 8, 12, 8,        8, 8, 8, 8, 8, 8, 12, 8,  //6
    8, 8, 8, 8, 8, 8, 12, 8,        8, 8, 8, 8, 8, 8, 12, 8,  //7

    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //8
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //9
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //A
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //B

    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //C
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //D
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //E
    8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8   //F
];
GameBoyCore.prototype.saveSRAMState = function () {
	if (!this.cBATT || this.MBCRam.length == 0) {
		//No battery backup...
		return [];
	}
	else {
		//Return the MBC RAM for backup...
		return this.fromTypedArray(this.MBCRam);
	}
}
GameBoyCore.prototype.saveRTCState = function () {
	if (!this.cTIMER) {
		//No battery backup...
		return [];
	}
	else {
		//Return the MBC RAM for backup...
		return [
			this.lastIteration,
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
			this.RTCHALT
		];
	}
}
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
		this.doubleSpeedShifter,
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
		this.gfxWindowCHRBankPosition,
		this.gfxWindowDisplay,
		this.gfxSpriteShow,
		this.gfxSpriteNormalHeight,
		this.gfxBackgroundCHRBankPosition,
		this.gfxBackgroundBankOffset,
		this.TIMAEnabled,
		this.DIVTicks,
		this.LCDTicks,
		this.timerTicks,
		this.TACClocker,
		this.serialTimer,
		this.serialShiftTimer,
		this.serialShiftTimerAllocated,
		this.IRQEnableDelay,
		this.lastIteration,
		this.cMBC1,
		this.cMBC2,
		this.cMBC3,
		this.cMBC5,
		this.cMBC7,
		this.cSRAM,
		this.cMMMO1,
		this.cRUMBLE,
		this.cCamera,
		this.cTAMA5,
		this.cHuC3,
		this.cHuC1,
		this.drewBlank,
		this.fromTypedArray(this.frameBuffer),
		this.bgEnabled,
		this.BGPriorityEnabled,
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
		this.channel1Fault,
		this.channel1ShadowFrequency,
		this.channel1volumeEnvTime,
		this.channel1volumeEnvTimeLast,
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
		this.channel2volumeEnvTimeLast,
		this.channel3canPlay,
		this.channel3totalLength,
		this.channel3patternType,
		this.channel3frequency,
		this.channel3consecutive,
		this.fromTypedArray(this.channel3PCM),
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
		this.channel4volumeEnvTimeLast,
		this.noiseTableLength,
		this.soundMasterEnabled,
		this.VinLeftChannelMasterVolume,
		this.VinRightChannelMasterVolume,
		this.leftChannel0,
		this.leftChannel1,
		this.leftChannel2,
		this.leftChannel3,
		this.rightChannel0,
		this.rightChannel1,
		this.rightChannel2,
		this.rightChannel3,
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
		this.usedBootROM,
		this.skipPCIncrement,
		this.STATTracker,
		this.gbcRamBankPositionECHO,
		this.numRAMBanks,
		this.windowY,
		this.windowX,
		this.returnOAMXCacheCopy(this.OAMAddresses),
		this.fromTypedArray(this.gbcOBJRawPalette),
		this.fromTypedArray(this.gbcBGRawPalette),
		this.fromTypedArray(this.gbOBJPalette),
		this.fromTypedArray(this.gbBGPalette),
		this.fromTypedArray(this.gbcOBJPalette),
		this.fromTypedArray(this.gbcBGPalette),
		this.fromTypedArray(this.gbBGColorizedPalette),
		this.fromTypedArray(this.gbOBJColorizedPalette),
		this.fromTypedArray(this.cachedBGPaletteConversion),
		this.fromTypedArray(this.cachedOBJPaletteConversion),
		this.fromTypedArray(this.BGCHRBank1),
		this.fromTypedArray(this.BGCHRBank2),
		this.haltPostClocks,
		this.interruptsRequested,
		this.interruptsEnabled,
		this.remainingClocks,
		this.colorizedGBPalettes
	];
}
GameBoyCore.prototype.returnFromState = function (returnedFrom) {
	var index = 0;
	var state = returnedFrom.slice(0);
	this.ROM = this.toTypedArray(state[index++], "uint8");
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
	this.doubleSpeedShifter = state[index++];
	this.memory = this.toTypedArray(state[index++], "uint8");
	this.MBCRam = this.toTypedArray(state[index++], "uint8");
	this.VRAM = this.toTypedArray(state[index++], "uint8");
	this.currVRAMBank = state[index++];
	this.GBCMemory = this.toTypedArray(state[index++], "uint8");
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
	this.gfxWindowCHRBankPosition = state[index++];
	this.gfxWindowDisplay = state[index++];
	this.gfxSpriteShow = state[index++];
	this.gfxSpriteNormalHeight = state[index++];
	this.gfxBackgroundCHRBankPosition = state[index++];
	this.gfxBackgroundBankOffset = state[index++];
	this.TIMAEnabled = state[index++];
	this.DIVTicks = state[index++];
	this.LCDTicks = state[index++];
	this.timerTicks = state[index++];
	this.TACClocker = state[index++];
	this.serialTimer = state[index++];
	this.serialShiftTimer = state[index++];
	this.serialShiftTimerAllocated = state[index++];
	this.IRQEnableDelay = state[index++];
	this.lastIteration = state[index++];
	this.cMBC1 = state[index++];
	this.cMBC2 = state[index++];
	this.cMBC3 = state[index++];
	this.cMBC5 = state[index++];
	this.cMBC7 = state[index++];
	this.cSRAM = state[index++];
	this.cMMMO1 = state[index++];
	this.cRUMBLE = state[index++];
	this.cCamera = state[index++];
	this.cTAMA5 = state[index++];
	this.cHuC3 = state[index++];
	this.cHuC1 = state[index++];
	this.drewBlank = state[index++];
	this.frameBuffer = this.toTypedArray(state[index++], "int32");
	this.bgEnabled = state[index++];
	this.BGPriorityEnabled = state[index++];
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
	this.channel1Fault = state[index++];
	this.channel1ShadowFrequency = state[index++];
	this.channel1volumeEnvTime = state[index++];
	this.channel1volumeEnvTimeLast = state[index++];
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
	this.channel2volumeEnvTimeLast = state[index++];
	this.channel3canPlay = state[index++];
	this.channel3totalLength = state[index++];
	this.channel3patternType = state[index++];
	this.channel3frequency = state[index++];
	this.channel3consecutive = state[index++];
	this.channel3PCM = this.toTypedArray(state[index++], "float32");
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
	this.channel4volumeEnvTimeLast = state[index++];
	this.noiseTableLength = state[index++];
	this.soundMasterEnabled = state[index++];
	this.VinLeftChannelMasterVolume = state[index++];
	this.VinRightChannelMasterVolume = state[index++];
	this.leftChannel0 = state[index++];
	this.leftChannel1 = state[index++];
	this.leftChannel2 = state[index++];
	this.leftChannel3 = state[index++];
	this.rightChannel0 = state[index++];
	this.rightChannel1 = state[index++];
	this.rightChannel2 = state[index++];
	this.rightChannel3 = state[index++];
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
	this.usedBootROM = state[index++];
	this.skipPCIncrement = state[index++];
	this.STATTracker = state[index++];
	this.gbcRamBankPositionECHO = state[index++];
	this.numRAMBanks = state[index++];
	this.windowY = state[index++];
	this.windowX = state[index++];
	this.OAMAddresses = this.returnOAMXCacheCopy(state[index++]);
	this.gbcOBJRawPalette = this.toTypedArray(state[index++], "uint8");
	this.gbcBGRawPalette = this.toTypedArray(state[index++], "uint8");
	this.gbOBJPalette = this.toTypedArray(state[index++], "int32");
	this.gbBGPalette = this.toTypedArray(state[index++], "int32");
	this.gbcOBJPalette = this.toTypedArray(state[index++], "int32");
	this.gbcBGPalette = this.toTypedArray(state[index++], "int32");
	this.gbBGColorizedPalette = this.toTypedArray(state[index++], "int32");
	this.gbOBJColorizedPalette = this.toTypedArray(state[index++], "int32");
	this.cachedBGPaletteConversion = this.toTypedArray(state[index++], "int32");
	this.cachedOBJPaletteConversion = this.toTypedArray(state[index++], "int32");
	this.BGCHRBank1 = this.toTypedArray(state[index++], "uint8");
	this.BGCHRBank2 = this.toTypedArray(state[index++], "uint8");
	this.haltPostClocks = state[index++];
	this.interruptsRequested = state[index++];
	this.interruptsEnabled = state[index++];
	this.checkIRQMatching();
	this.remainingClocks = state[index++];
	this.colorizedGBPalettes = state[index];
	this.fromSaveState = true;
	this.TICKTable = this.toTypedArray(this.TICKTable, "uint8");
	this.SecondaryTICKTable = this.toTypedArray(this.SecondaryTICKTable, "uint8");
	this.initializeReferencesFromSaveState();
	this.memoryReadJumpCompile();
	this.memoryWriteJumpCompile();
	this.initLCD();
	this.initSound();
	this.noiseSampleTable = (this.noiseTableLength == 0x8000) ? this.LSFR15Table : this.LSFR7Table;
	this.channel4VolumeShifter = (this.noiseTableLength == 0x8000) ? 15 : 7;
	this.drawToCanvas();
}
GameBoyCore.prototype.returnFromRTCState = function () {
	if (typeof this.openRTC == "function" && this.cTIMER) {
		var rtcData = this.openRTC(this.name);
		var index = 0;
		this.lastIteration = rtcData[index++];
		this.RTCisLatched = rtcData[index++];
		this.latchedSeconds = rtcData[index++];
		this.latchedMinutes = rtcData[index++];
		this.latchedHours = rtcData[index++];
		this.latchedLDays = rtcData[index++];
		this.latchedHDays = rtcData[index++];
		this.RTCSeconds = rtcData[index++];
		this.RTCMinutes = rtcData[index++];
		this.RTCHours = rtcData[index++];
		this.RTCDays = rtcData[index++];
		this.RTCDayOverFlow = rtcData[index++];
		this.RTCHALT = rtcData[index];
	}
}
GameBoyCore.prototype.start = function () {
	settings[4] = 0;	//Reset the frame skip setting.
	this.initMemory();	//Write the startup memory.
	this.ROMLoad();		//Load the ROM into memory and get cartridge information from it.
	this.initLCD();		//Initialize the graphics.
	this.initSound();	//Sound object initialization.
	this.run();			//Start the emulation.
}
GameBoyCore.prototype.initMemory = function () {
	//Initialize the RAM:
	this.memory = this.getTypedArray(0x10000, 0, "uint8");
	this.frameBuffer = this.getTypedArray(23040, 0xF8F8F8, "int32");
	this.BGCHRBank1 = this.getTypedArray(0x800, 0, "uint8");
	this.TICKTable = this.toTypedArray(this.TICKTable, "uint8");
	this.SecondaryTICKTable = this.toTypedArray(this.SecondaryTICKTable, "uint8");
	this.channel3PCM = this.getTypedArray(0x60, 0, "float32");
}
GameBoyCore.prototype.generateCacheArray = function (tileAmount) {
	var tileArray = [];
	var tileNumber = 0;
	while (tileNumber < tileAmount) {
		tileArray[tileNumber++] = this.getTypedArray(64, 0, "uint8");
	}
	return tileArray;
}
GameBoyCore.prototype.initSkipBootstrap = function () {
	//Fill in the boot ROM set register values
	//Default values to the GB boot ROM values, then fill in the GBC boot ROM values after ROM loading
	var index = 0xFF;
	while (index >= 0) {
		if (index >= 0x30 && index < 0x40) {
			this.memoryWrite(0xFF00 | index, this.ffxxDump[index]);
		}
		else {
			switch (index) {
				case 0x00:
				case 0x01:
				case 0x02:
				case 0x05:
				case 0x07:
				case 0x0F:
				case 0xFF:
					this.memoryWrite(0xFF00 | index, this.ffxxDump[index]);
					break;
				default:
					this.memory[0xFF00 | index] = this.ffxxDump[index];
			}
		}
		--index;
	}
	if (this.cGBC) {
		this.memory[0xFF6C] = 0xFE;
		this.memory[0xFF74] = 0xFE;
	}
	else {
		this.memory[0xFF48] = 0xFF;
		this.memory[0xFF49] = 0xFF;
		this.memory[0xFF6C] = 0xFF;
		this.memory[0xFF74] = 0xFF;
	}
	//Start as an unset device:
	cout("Starting without the GBC boot ROM.", 0);
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
	this.LCDCONTROL = this.LINECONTROL;
	this.IME = false;
	this.IRQLineMatched = 0;
	this.interruptsRequested = 225;
	this.interruptsEnabled = 0;
	this.hdmaRunning = false;
	this.CPUTicks = 12;
	this.STATTracker = 0;
	this.modeSTAT = 1;
	this.spriteCount = 252;
	this.LYCMatchTriggerSTAT = false;
	this.mode2TriggerSTAT = false;
	this.mode1TriggerSTAT = false;
	this.mode0TriggerSTAT = false;
	this.LCDisOn = true;
	this.channel1adjustedFrequencyPrep = 0.008126984126984127;
	this.channel1adjustedDuty = 0.5;
	this.channel1totalLength = 0;
	this.channel1envelopeVolume = 0;
	this.channel1currentVolume = 0;
	this.channel1envelopeType = false;
	this.channel1envelopeSweeps = 0;
	this.channel1consecutive = true;
	this.channel1frequency = 1985;
	this.channel1Fault = 0;
	this.channel1ShadowFrequency = 1985;
	this.channel1volumeEnvTime = 0;
	this.channel1volumeEnvTimeLast = 12000;
	this.channel1timeSweep = 0;
	this.channel1lastTimeSweep = 0;
	this.channel1numSweep = 0;
	this.channel1frequencySweepDivider = 0;
	this.channel1decreaseSweep = false;
	this.channel2adjustedFrequencyPrep = 0;
	this.channel2adjustedDuty = 0.5;
	this.channel2totalLength = 0;
	this.channel2envelopeVolume = 0;
	this.channel2currentVolume = 0;
	this.channel2envelopeType = false;
	this.channel2envelopeSweeps = 0;
	this.channel2consecutive = true;
	this.channel2frequency = 0;
	this.channel2volumeEnvTime = 0;
	this.channel2volumeEnvTimeLast = 0;
	this.channel3canPlay = false;
	this.channel3totalLength = 0;
	this.channel3patternType = -32;
	this.channel3frequency = 0;
	this.channel3consecutive = true;
	this.channel3adjustedFrequencyPrep = 0.512;
	this.channel4adjustedFrequencyPrep = 0;
	this.channel4totalLength = 0;
	this.channel4envelopeVolume = 0;
	this.channel4currentVolume = 0;
	this.channel4envelopeType = false;
	this.channel4envelopeSweeps = 0;
	this.channel4consecutive = true;
	this.channel4volumeEnvTime = 0;
	this.channel4volumeEnvTimeLast = 0;
	this.noiseTableLength = 0x8000;
	this.channel4VolumeShifter = 15;
	this.channel1lastSampleLookup = 0.7169351111064097;
	this.channel2lastSampleLookup = 0;
	this.channel3Tracker = 0;
	this.channel4lastSampleLookup = 0;
	this.VinLeftChannelMasterVolume = 1;
	this.VinRightChannelMasterVolume = 1;
	this.soundMasterEnabled = true;
	this.leftChannel0 = true;
	this.leftChannel1 = true;
	this.leftChannel2 = true;
	this.leftChannel3 = true;
	this.rightChannel0 = true;
	this.rightChannel1 = true;
	this.rightChannel2 = false;
	this.rightChannel3 = false;
	this.DIVTicks = 27044;
	this.LCDTicks = 160;
	this.timerTicks = 0;
	this.TIMAEnabled = false;
	this.TACClocker = 1024;
	this.serialTimer = 0;
	this.serialShiftTimer = 0;
	this.serialShiftTimerAllocated = 0;
	this.IRQEnableDelay = 0;
	this.actualScanLine = 144;
	this.gfxWindowDisplay = false;
	this.gfxSpriteShow = false;
	this.gfxSpriteNormalHeight = true;
	this.bgEnabled = true;
	this.BGPriorityEnabled = 0x1000000;
	this.gfxWindowCHRBankPosition = 0;
	this.gfxBackgroundCHRBankPosition = 0;
	this.gfxBackgroundBankOffset = 0;
	this.windowY = 0;
	this.windowX = 0;
	this.drewBlank = 0;
	this.drewFrame = true;
	this.midScanlineOffset = -1;
	this.currentX = 0;
}
GameBoyCore.prototype.initBootstrap = function () {
	//Start as an unset device:
	cout("Starting the selected boot ROM.", 0);
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
	this.leftChannel0 = false;
	this.leftChannel1 = false;
	this.leftChannel2 = false;
	this.leftChannel3 = false;
	this.rightChannel0 = false;
	this.rightChannel1 = false;
	this.rightChannel2 = false;
	this.rightChannel3 = false;
	this.channel2frequency = this.channel1frequency = 0;
	this.channel2volumeEnvTime = this.channel1volumeEnvTime = 0;
	this.channel4consecutive = this.channel2consecutive = this.channel1consecutive = false;
	this.VinLeftChannelMasterVolume = 1;
	this.VinRightChannelMasterVolume = 1;
	this.memory[0xFF00] = 0xF;	//Set the joypad state.
}
GameBoyCore.prototype.ROMLoad = function () {
	//Load the first two ROM banks (0x0000 - 0x7FFF) into regular gameboy memory:
	this.ROM = [];
	this.usedBootROM = settings[16];
	var maxLength = this.ROMImage.length;
	if (maxLength < 0x4000) {
		throw(new Error("ROM image size too small."));
	}
	this.ROM = this.getTypedArray(maxLength, 0, "uint8");
	var romIndex = 0;
	if (this.usedBootROM) {
		if (!settings[20]) {
			//Patch in the GBC boot ROM into the memory map:
			for (; romIndex < 0x100; ++romIndex) {
				this.memory[romIndex] = this.GBCBOOTROM[romIndex];											//Load in the GameBoy Color BOOT ROM.
				this.ROM[romIndex] = (this.ROMImage.charCodeAt(romIndex) & 0xFF);							//Decode the ROM binary for the switch out.
			}
			for (; romIndex < 0x200; ++romIndex) {
				this.memory[romIndex] = this.ROM[romIndex] = (this.ROMImage.charCodeAt(romIndex) & 0xFF);	//Load in the game ROM.
			}
			for (; romIndex < 0x900; ++romIndex) {
				this.memory[romIndex] = this.GBCBOOTROM[romIndex - 0x100];									//Load in the GameBoy Color BOOT ROM.
				this.ROM[romIndex] = (this.ROMImage.charCodeAt(romIndex) & 0xFF);							//Decode the ROM binary for the switch out.
			}
			this.usedGBCBootROM = true;
		}
		else {
			//Patch in the GBC boot ROM into the memory map:
			for (; romIndex < 0x100; ++romIndex) {
				this.memory[romIndex] = this.GBBOOTROM[romIndex];											//Load in the GameBoy Color BOOT ROM.
				this.ROM[romIndex] = (this.ROMImage.charCodeAt(romIndex) & 0xFF);							//Decode the ROM binary for the switch out.
			}
		}
		for (; romIndex < 0x4000; ++romIndex) {
			this.memory[romIndex] = this.ROM[romIndex] = (this.ROMImage.charCodeAt(romIndex) & 0xFF);	//Load in the game ROM.
		}
	}
	else {
		//Don't load in the boot ROM:
		for (; romIndex < 0x4000; ++romIndex) {
			this.memory[romIndex] = this.ROM[romIndex] = (this.ROMImage.charCodeAt(romIndex) & 0xFF);	//Load in the game ROM.
		}
	}
	//Finish the decoding of the ROM binary:
	for (; romIndex < maxLength; ++romIndex) {
		this.ROM[romIndex] = (this.ROMImage.charCodeAt(romIndex) & 0xFF);
	}
	//Set up the emulator for the cartidge specifics:
	this.interpretCartridge();
	//Check for IRQ matching upon initialization:
	this.checkIRQMatching();
}
GameBoyCore.prototype.getROMImage = function () {
	//Return the binary version of the ROM image currently running:
	if (this.ROMImage.length > 0) {
		return this.ROMImage.length;
	}
	var length = this.ROM.length;
	for (var index = 0; index < length; index++) {
		this.ROMImage += String.fromCharCode(this.ROM[index]);
	}
	return this.ROMImage;
}
GameBoyCore.prototype.interpretCartridge = function () {
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
		case 0x22:
			this.cMBC7 = true;
			this.cSRAM = true;
			this.cBATT = true;
			MBCType = "MBC7 + SRAM + BATT";
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
			case 0x32:	//Exception to the GBC identifying code:
				if (!settings[2] && this.name + this.gameCode + this.ROM[0x143] == "Game and Watch 50") {
					this.cGBC = true;
					cout("Created a boot exception for Game and Watch Gallery 2 (GBC ID byte is wrong on the cartridge).", 1);
				}
				else {
					this.cGBC = false;
				}
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
		this.cGBC = this.usedGBCBootROM;	//Allow the GBC boot ROM to run in GBC mode...
		this.setupRAM();	//CPU/(V)RAM initialization.
		this.initBootstrap();
	}
	this.initializeModeSpecificArrays();
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
	this.ROMImage = "";	//Memory consumption reduction.
}
GameBoyCore.prototype.disableBootROM = function () {
	//Remove any traces of the boot ROM from ROM memory.
	for (var index = 0; index < 0x100; ++index) {
		this.memory[index] = this.ROM[index];	//Replace the GameBoy or GameBoy Color boot ROM with the game ROM.
	}
	if (this.usedGBCBootROM) {
		//Remove any traces of the boot ROM from ROM memory.
		for (index = 0x200; index < 0x900; ++index) {
			this.memory[index] = this.ROM[index];	//Replace the GameBoy Color boot ROM with the game ROM.
		}
		if (!this.cGBC) {
			//Clean up the post-boot (GB mode only) state:
			this.GBCtoGBModeAdjust();
		}
		else {
			this.recompileBootIOWriteHandling();
		}
	}
	else {
		this.recompileBootIOWriteHandling();
	}
}
GameBoyCore.prototype.initializeTiming = function () {
	//Emulator Timing:
	this.baseCPUCyclesPerIteration = 4194.3 * settings[6];
	this.setEmulatorSpeed(1);
}
GameBoyCore.prototype.setEmulatorSpeed = function(speed) {
	this.CPUCyclesPerIteration = this.baseCPUCyclesPerIteration * speed;
	this.CPUCyclesTotalRoundoff = this.CPUCyclesPerIteration % 4;
	this.CPUCyclesTotalBase = this.CPUCyclesTotal = (this.CPUCyclesPerIteration - this.CPUCyclesTotalRoundoff) | 0;
	this.CPUCyclesTotalCurrent = 0;
	this.setAudioSpeed(speed);
}
GameBoyCore.prototype.setAudioSpeed = function (speed) {
	this.preChewedAudioComputationMultiplier = 0x20000 / settings[14];
	this.preChewedWAVEAudioComputationMultiplier = 0x200000 / settings[14];
	this.whiteNoiseFrequencyPreMultiplier = 4194300 / settings[14] / 8;
	this.volumeEnvelopePreMultiplier = settings[14] / 0x40 / speed;
	this.channel1TimeSweepPreMultiplier = settings[14] / 0x80 / speed;
	this.audioTotalLengthMultiplier = settings[14] / 0x100 / speed;
}
GameBoyCore.prototype.setupRAM = function () {
	//Setup the auxilliary/switchable RAM:
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
		var MBCRam = (typeof this.openMBC == "function") ? this.openMBC(this.name) : [];
		if (MBCRam.length > 0) {
			//Flash the SRAM into memory:
			this.MBCRam = this.toTypedArray(MBCRam, "uint8");
		}
		else {
			this.MBCRam = this.getTypedArray(this.numRAMBanks * 0x2000, 0, "uint8");
		}
	}
	cout("Actual bytes of MBC RAM allocated: " + (this.numRAMBanks * 0x2000), 0);
	this.returnFromRTCState();
	//Setup the RAM for GBC mode.
	if (this.cGBC) {
		this.VRAM = this.getTypedArray(0x2000, 0, "uint8");
		this.GBCMemory = this.getTypedArray(0x7000, 0, "uint8");
	}
	else {
		this.resetOAMXCache();
	}
	this.memoryReadJumpCompile();
	this.memoryWriteJumpCompile();
}
GameBoyCore.prototype.MBCRAMUtilized = function () {
	return this.cMBC1 || this.cMBC2 || this.cMBC3 || this.cMBC5 || this.cMBC7 || this.cRUMBLE;
}
GameBoyCore.prototype.recomputeDimension = function () {
	//Cache some dimension info:
	this.pixelCount = this.width * this.height;
	this.rgbCount = this.pixelCount * 4;
	this.widthRatio = 160 / this.width;
	this.heightRatio = 144 / this.height;
}
GameBoyCore.prototype.initLCD = function () {
	this.recomputeDimension();
	this.completeFrame = this.getTypedArray(this.pixelCount, 0, "int32");	//Used for double-buffering and the target for software-side rescaling.
	this.compileResizeFrameBufferFunction();
	try {
		this.drawContext = this.canvas.getContext("2d");
		//Get a CanvasPixelArray buffer:
		try {
			this.canvasBuffer = this.drawContext.createImageData(this.width, this.height);
		}
		catch (error) {
			cout("Falling back to the getImageData initialization (Error \"" + error.message + "\").", 1);
			this.canvasBuffer = this.drawContext.getImageData(0, 0, this.width, this.height);
		}
		var index = this.rgbCount;
		while (index > 0) {
			this.canvasBuffer.data[index -= 4] = 0xF8;
			this.canvasBuffer.data[index + 1] = 0xF8;
			this.canvasBuffer.data[index + 2] = 0xF8;
			this.canvasBuffer.data[index + 3] = 0xFF;
		}
		this.drawContext.putImageData(this.canvasBuffer, 0, 0);		//Throws any browser that won't support this later on.
		this.canvas.style.visibility = "visible";
		this.prepareFrame();
	}
	catch (error) {
		throw(new Error("HTML5 Canvas support required."));
	}
}
GameBoyCore.prototype.JoyPadEvent = function (key, down) {
	if (down) {
		this.JoyPad &= 0xFF ^ (1 << key);
		/*if (!this.cGBC) {
			this.interruptsRequested |= 0x10;	//A real GBC doesn't set this!
			this.checkIRQMatching();
		}*/
	}
	else {
		this.JoyPad |= (1 << key);
	}
	this.memory[0xFF00] = (this.memory[0xFF00] & 0x30) + ((((this.memory[0xFF00] & 0x20) == 0) ? (this.JoyPad >> 4) : 0xF) & (((this.memory[0xFF00] & 0x10) == 0) ? (this.JoyPad & 0xF) : 0xF));
}
GameBoyCore.prototype.GyroEvent = function (x, y) {
	x *= -100;
	x += 2047;
	this.highX = x >> 8;
	this.lowX = x & 0xFF;
	y *= -100;
	y += 2047;
	this.highY = y >> 8;
	this.lowY = y & 0xFF;
}
GameBoyCore.prototype.initSound = function () {
	if (settings[0]) {
		this.soundChannelsAllocated = (!settings[1]) ? 2 : 1;
		this.soundFrameShifter = this.soundChannelsAllocated - 1;
		try {
			var parentObj = this;
			this.sampleSize = settings[14] / 1000 * settings[6];
			this.audioHandle = new XAudioServer(this.soundChannelsAllocated, settings[14], (this.sampleSize * 4) << this.soundFrameShifter, (this.sampleSize * 20) << this.soundFrameShifter, function (sampleCount) {
				return parentObj.audioUnderRun(sampleCount);
			}, -1);
			cout("...Audio Channels: " + this.soundChannelsAllocated, 0);
			cout("...Sample Rate: " + settings[14], 0);
			this.initAudioBuffer();
		}
		catch (error) {
			cout("Audio system cannot run: " + error.message, 2);
			settings[0] = false;
		}
	}
	else if (this.audioHandle) {
		//Neutralize the audio output:
		try {
			this.audioHandle = new XAudioServer(1, 1000, 5000, 20000, function (sampleCount) {
				return [];
			}, 0);
		}
		catch (error) { }
	}
}
GameBoyCore.prototype.initAudioBuffer = function () {
	this.audioTicks = this.audioIndex = 0;
	this.bufferContainAmount = (this.sampleSize * 5) << this.soundFrameShifter;
	cout("...Samples per interpreter loop iteration (Per Channel): " + this.sampleSize, 0);
	this.samplesOut = this.sampleSize / this.CPUCyclesPerIteration;
	cout("...Samples per clock cycle (Per Channel): " + this.samplesOut, 0);
	this.numSamplesTotal = this.sampleSize << this.soundFrameShifter;
	this.currentBuffer = this.getTypedArray(this.numSamplesTotal, -1, "float32");
	this.intializeWhiteNoise();
}
GameBoyCore.prototype.intializeWhiteNoise = function () {
	//Noise Sample Tables:
	var randomFactor = 1;
	//15-bit LSFR Cache Generation:
	this.LSFR15Table = this.getTypedArray(0x80000, 0, "float32");
	var LSFR = 0x7FFF;	//Seed value has all its bits set.
	var LSFRShifted = 0x3FFF;
	for (var index = 0; index < 0x8000; index++) {
		//Normalize the last LSFR value for usage:
		randomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
		//Cache the different volume level results:
		this.LSFR15Table[0x08000 | index] = randomFactor * 0x1 / 0x1E;
		this.LSFR15Table[0x10000 | index] = randomFactor * 0x2 / 0x1E;
		this.LSFR15Table[0x18000 | index] = randomFactor * 0x3 / 0x1E;
		this.LSFR15Table[0x20000 | index] = randomFactor * 0x4 / 0x1E;
		this.LSFR15Table[0x28000 | index] = randomFactor * 0x5 / 0x1E;
		this.LSFR15Table[0x30000 | index] = randomFactor * 0x6 / 0x1E;
		this.LSFR15Table[0x38000 | index] = randomFactor * 0x7 / 0x1E;
		this.LSFR15Table[0x40000 | index] = randomFactor * 0x8 / 0x1E;
		this.LSFR15Table[0x48000 | index] = randomFactor * 0x9 / 0x1E;
		this.LSFR15Table[0x50000 | index] = randomFactor * 0xA / 0x1E;
		this.LSFR15Table[0x58000 | index] = randomFactor * 0xB / 0x1E;
		this.LSFR15Table[0x60000 | index] = randomFactor * 0xC / 0x1E;
		this.LSFR15Table[0x68000 | index] = randomFactor * 0xD / 0x1E;
		this.LSFR15Table[0x70000 | index] = randomFactor * 0xE / 0x1E;
		this.LSFR15Table[0x78000 | index] = randomFactor / 2;
		//Recompute the LSFR algorithm:
		LSFRShifted = LSFR >> 1;
		LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 14);
	}
	//7-bit LSFR Cache Generation:
	this.LSFR7Table = this.getTypedArray(0x800, 0, "float32");
	LSFR = 0x7F;	//Seed value has all its bits set.
	for (index = 0; index < 0x80; index++) {
		//Normalize the last LSFR value for usage:
		randomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
		//Cache the different volume level results:
		this.LSFR7Table[0x080 | index] = randomFactor * 0x1 / 0x1E;
		this.LSFR7Table[0x100 | index] = randomFactor * 0x2 / 0x1E;
		this.LSFR7Table[0x180 | index] = randomFactor * 0x3 / 0x1E;
		this.LSFR7Table[0x200 | index] = randomFactor * 0x4 / 0x1E;
		this.LSFR7Table[0x280 | index] = randomFactor * 0x5 / 0x1E;
		this.LSFR7Table[0x300 | index] = randomFactor * 0x6 / 0x1E;
		this.LSFR7Table[0x380 | index] = randomFactor * 0x7 / 0x1E;
		this.LSFR7Table[0x400 | index] = randomFactor * 0x8 / 0x1E;
		this.LSFR7Table[0x480 | index] = randomFactor * 0x9 / 0x1E;
		this.LSFR7Table[0x500 | index] = randomFactor * 0xA / 0x1E;
		this.LSFR7Table[0x580 | index] = randomFactor * 0xB / 0x1E;
		this.LSFR7Table[0x600 | index] = randomFactor * 0xC / 0x1E;
		this.LSFR7Table[0x680 | index] = randomFactor * 0xD / 0x1E;
		this.LSFR7Table[0x700 | index] = randomFactor * 0xE / 0x1E;
		this.LSFR7Table[0x780 | index] = randomFactor / 2;
		//Recompute the LSFR algorithm:
		LSFRShifted = LSFR >> 1;
		LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 6);
	}
	if (!this.noiseSampleTable && this.memory.length == 0x10000) {
		//If enabling audio for the first time after a game is already running, set up the internal table reference:
		this.noiseSampleTable = ((this.memory[0xFF22] & 0x8) == 0x8) ? this.LSFR7Table : this.LSFR15Table;
	}
}
GameBoyCore.prototype.audioUnderRun = function (samplesRequestedRaw) {
	if (settings[0]) {
		//We need more audio samples since we went below our set low limit:
		var neededSamples = this.audioIndex - samplesRequestedRaw;
		if (neededSamples < 0) {
			//Use any existing samples and then create some:
			var tempBuffer = [];
			if (this.audioIndex > 0) {
				for (var index = 0; index < this.audioIndex; index++) {
					tempBuffer.push(this.currentBuffer[index]);
				}
				samplesRequestedRaw -= this.audioIndex;
				this.audioIndex = 0;
			}
			return (samplesRequestedRaw > 0) ? this.generateAudioSafe(tempBuffer, samplesRequestedRaw >> this.soundFrameShifter) : tempBuffer;
		}
		else if (neededSamples == 0) {
			//Use the overflow buffer's existing samples:
			this.audioIndex = 0;
			return this.currentBuffer;
		}
		else {
			//Use the overflow buffer's existing samples:
			var tempBuffer = this.audioInternalBuffer;
			var currentBuffer = this.currentBuffer;
			for (var index = 0; index < samplesRequestedRaw; ++index) {
				tempBuffer[index] = currentBuffer[index];
			}
			this.audioIndex = neededSamples;
			while (--neededSamples >= 0) {
				//Move over the remaining samples to their new positions:
				this.currentBuffer[neededSamples] = this.currentBuffer[samplesRequestedRaw + neededSamples];
			}
			return tempBuffer;
		}
	}
	else {
		//Return nothing just in case the callback is still hooked:
		return [];
	}
}
GameBoyCore.prototype.audioUnderrunAdjustment = function () {
	if (settings[0]) {
		var underrunAmount = this.bufferContainAmount - this.audioHandle.remainingBuffer();
		if (underrunAmount > 0) {
			this.CPUCyclesTotalCurrent += (underrunAmount >> this.soundFrameShifter) * this.samplesOut;
			this.recalculateIterationClockLimit();
		}
	}
}
GameBoyCore.prototype.initializeAudioStartState = function (resetType) {
	this.channel1adjustedFrequencyPrep = 0;
	this.channel1adjustedDuty = 0.5;
	this.channel1totalLength = 0;
	this.channel1envelopeVolume = 0;
	this.channel1currentVolume = 0;
	this.channel1envelopeType = false;
	this.channel1envelopeSweeps = 0;
	this.channel1consecutive = true;
	this.channel1frequency = 0;
	this.channel1Fault = 0x2;
	this.channel1ShadowFrequency = 0;
	this.channel1volumeEnvTime = 0;
	this.channel1volumeEnvTimeLast = 0;
	this.channel1timeSweep = 0;
	this.channel1lastTimeSweep = 0;
	this.channel1numSweep = 0;
	this.channel1frequencySweepDivider = 0;
	this.channel1decreaseSweep = false;
	this.channel2adjustedFrequencyPrep = 0;
	this.channel2adjustedDuty = 0.5;
	this.channel2totalLength = 0;
	this.channel2envelopeVolume = 0;
	this.channel2currentVolume = 0;
	this.channel2envelopeType = false;
	this.channel2envelopeSweeps = 0;
	this.channel2consecutive = true;
	this.channel2frequency = 0;
	this.channel2volumeEnvTime = 0;
	this.channel2volumeEnvTimeLast = 0;
	this.channel3canPlay = false;
	this.channel3totalLength = 0;
	this.channel3patternType = -0x20;
	this.channel3frequency = 0;
	this.channel3consecutive = true;
	this.channel3adjustedFrequencyPrep = 0x20000 / settings[14];
	this.channel4adjustedFrequencyPrep = 0;
	this.channel4totalLength = 0;
	this.channel4envelopeVolume = 0;
	this.channel4currentVolume = 0;
	this.channel4envelopeType = false;
	this.channel4envelopeSweeps = 0;
	this.channel4consecutive = true;
	this.channel4volumeEnvTime = 0;
	this.channel4volumeEnvTimeLast = 0;
	this.noiseTableLength = 0x8000;
	this.noiseSampleTable = this.LSFR15Table;
	this.channel4VolumeShifter = 15;
	this.channel1lastSampleLookup = 0;
	this.channel2lastSampleLookup = 0;
	this.channel3Tracker = 0;
	this.channel4lastSampleLookup = 0;
	this.VinLeftChannelMasterVolume = 1;
	this.VinRightChannelMasterVolume = 1;
}
//Below are the audio generation functions timed against the CPU:
GameBoyCore.prototype.generateAudio = function (numSamples) {
	if (this.soundMasterEnabled) {
		if (!settings[1]) {						//Split Mono & Stereo into two, to avoid this if statement every iteration of the loop.
			while (--numSamples > -1) {
				//STEREO
				this.audioChannelsComputeStereo();
				this.currentBuffer[this.audioIndex++] = this.currentSampleLeft * this.VinLeftChannelMasterVolume - 1;
				this.currentBuffer[this.audioIndex++] = this.currentSampleRight * this.VinRightChannelMasterVolume - 1;
				if (this.audioIndex == this.numSamplesTotal) {
					this.audioIndex = 0;
					this.audioHandle.writeAudio(this.currentBuffer);
				}
			}
		}
		else {
			while (--numSamples > -1) {
				//MONO
				this.audioChannelsComputeMono();
				this.currentBuffer[this.audioIndex++] = this.currentSampleRight * this.VinRightChannelMasterVolume - 1;
				if (this.audioIndex == this.numSamplesTotal) {
					this.audioIndex = 0;
					this.audioHandle.writeAudio(this.currentBuffer);
				}
			}
		}
	}
	else {
		//SILENT OUTPUT:
		if (!settings[1]) {
			while (--numSamples > -1) {
				//STEREO
				this.currentBuffer[this.audioIndex++] = -1;
				this.currentBuffer[this.audioIndex++] = -1;
				if (this.audioIndex == this.numSamplesTotal) {
					this.audioIndex = 0;
					this.audioHandle.writeAudio(this.currentBuffer);
				}
			}
		}
		else {
			while (--numSamples > -1) {
				//MONO
				this.currentBuffer[this.audioIndex++] = -1;
				if (this.audioIndex == this.numSamplesTotal) {
					this.audioIndex = 0;
					this.audioHandle.writeAudio(this.currentBuffer);
				}
			}
		}
	}
}
GameBoyCore.prototype.audioJIT = function () {
	if (settings[0]) {
		//Audio Sample Generation Timing:
		var amount = this.audioTicks * this.samplesOut;
		var actual = amount | 0;
		this.rollover += amount - actual;
		if (this.rollover >= 1) {
			--this.rollover;
			++actual;
		}
		this.generateAudio(actual);
	}
	this.audioTicks = 0;
}
GameBoyCore.prototype.audioChannelsComputeStereo = function () {
	//Channel 1:
	if ((this.channel1consecutive || this.channel1totalLength > 0) && this.channel1Fault == 0) {
		if (this.channel1lastSampleLookup <= this.channel1adjustedDuty) {
			this.currentSampleLeft = (this.leftChannel0) ? this.channel1currentVolume : 0;
			this.currentSampleRight = (this.rightChannel0) ? this.channel1currentVolume : 0;
		}
		else {
			this.currentSampleRight = this.currentSampleLeft = 0;
		}
		if (this.channel1numSweep > 0) {
			if (--this.channel1timeSweep == 0) {
				--this.channel1numSweep;
				if (this.channel1decreaseSweep) {
					this.channel1ShadowFrequency -= this.channel1ShadowFrequency >> this.channel1frequencySweepDivider;
					//Pre-calculate the frequency computation outside the waveform generator for speed:
					this.channel1adjustedFrequencyPrep = this.preChewedAudioComputationMultiplier / (0x800 - this.channel1ShadowFrequency);
				}
				else {
					this.channel1ShadowFrequency += this.channel1ShadowFrequency >> this.channel1frequencySweepDivider;
					if (this.channel1ShadowFrequency <= 0x7FF) {
						//Pre-calculate the frequency computation outside the waveform generator for speed:
						this.channel1adjustedFrequencyPrep = this.preChewedAudioComputationMultiplier / (0x800 - this.channel1ShadowFrequency);
					}
					else {
						this.channel1Fault |= 0x2;
						this.memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
					}
				}
				this.channel1timeSweep = this.channel1lastTimeSweep;
			}
		}
		if (this.channel1envelopeSweeps > 0) {
			if (this.channel1volumeEnvTime > 0) {
				--this.channel1volumeEnvTime;
			}
			else {
				if (!this.channel1envelopeType) {
					if (this.channel1envelopeVolume > 0) {
						this.channel1currentVolume = --this.channel1envelopeVolume / 0x1E;
						this.channel1volumeEnvTime = this.channel1volumeEnvTimeLast;
					}
					else {
						this.channel1envelopeSweeps = 0;
					}
				}
				else if (this.channel1envelopeVolume < 0xF) {
					this.channel1currentVolume = ++this.channel1envelopeVolume / 0x1E;
					this.channel1volumeEnvTime = this.channel1volumeEnvTimeLast;
				}
				else {
					this.channel1envelopeSweeps = 0;
				}
			}
		}
		if (this.channel1totalLength > 0) {
			--this.channel1totalLength;
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
		this.currentSampleRight = this.currentSampleLeft = 0;
	}
	//Channel 2:
	if ((this.channel2consecutive || this.channel2totalLength > 0)) {
		if (this.channel2lastSampleLookup <= this.channel2adjustedDuty) {
			if (this.leftChannel1) {
				this.currentSampleLeft += this.channel2currentVolume;
			}
			if (this.rightChannel1) {
				this.currentSampleRight += this.channel2currentVolume;
			}
		}
		if (this.channel2envelopeSweeps > 0) {
			if (this.channel2volumeEnvTime > 0) {
				--this.channel2volumeEnvTime;
			}
			else {
				if (!this.channel2envelopeType) {
					if (this.channel2envelopeVolume > 0) {
						this.channel2currentVolume = --this.channel2envelopeVolume / 0x1E;
						this.channel2volumeEnvTime = this.channel2volumeEnvTimeLast;
					}
					else {
						this.channel2envelopeSweeps = 0;
					}
				}
				else if (this.channel2envelopeVolume < 0xF) {
					this.channel2currentVolume = ++this.channel2envelopeVolume / 0x1E;
					this.channel2volumeEnvTime = this.channel2volumeEnvTimeLast;
				}
				else {
					this.channel2envelopeSweeps = 0;
				}
			}
		}
		if (this.channel2totalLength > 0) {
			--this.channel2totalLength;
			if (this.channel2totalLength <= 0) {
				this.memory[0xFF26] &= 0xFD;	//Channel #2 On Flag Off
			}
		}
		this.channel2lastSampleLookup += this.channel2adjustedFrequencyPrep;
		while (this.channel2lastSampleLookup >= 1) {
			this.channel2lastSampleLookup -= 1;
		}
	}
	//Channel 3:
	if (this.channel3canPlay && (this.channel3consecutive || this.channel3totalLength > 0)) {
		if (this.channel3patternType > -0x20) {
			var PCMSample = this.channel3PCM[this.channel3Tracker | this.channel3patternType];
			if (this.leftChannel2) {
				this.currentSampleLeft += PCMSample;
			}
			if (this.rightChannel2) {
				this.currentSampleRight += PCMSample;
			}
		}
		this.channel3Tracker += this.channel3adjustedFrequencyPrep;
		if (this.channel3Tracker >= 0x20) {
			this.channel3Tracker -= 0x20;
		}
		if (this.channel3totalLength > 0) {
			--this.channel3totalLength;
			if (this.channel3totalLength <= 0) {
				this.memory[0xFF26] &= 0xFB;	//Channel #3 On Flag Off
			}
		}
	}
	//Channel 4:
	if (this.channel4consecutive || this.channel4totalLength > 0) {
		var duty = this.noiseSampleTable[this.channel4currentVolume | this.channel4lastSampleLookup];
		if (this.leftChannel3) {
			this.currentSampleLeft += duty;
		}
		if (this.rightChannel3) {
			this.currentSampleRight += duty;
		}
		if (this.channel4envelopeSweeps > 0) {
			if (this.channel4volumeEnvTime > 0) {
				--this.channel4volumeEnvTime;
			}
			else {
				if (!this.channel4envelopeType) {
					if (this.channel4envelopeVolume > 0) {
						this.channel4currentVolume = --this.channel4envelopeVolume << this.channel4VolumeShifter;
						this.channel4volumeEnvTime = this.channel4volumeEnvTimeLast;
					}
					else {
						this.channel4envelopeSweeps = 0;
					}
				}
				else if (this.channel4envelopeVolume < 0xF) {
					this.channel4currentVolume = ++this.channel4envelopeVolume << this.channel4VolumeShifter;
					this.channel4volumeEnvTime = this.channel4volumeEnvTimeLast;
				}
				else {
					this.channel4envelopeSweeps = 0;
				}
			}
		}
		if (this.channel4totalLength > 0) {
			--this.channel4totalLength;
			if (this.channel4totalLength <= 0) {
				this.memory[0xFF26] &= 0xF7;	//Channel #4 On Flag Off
			}
		}
		this.channel4lastSampleLookup += this.channel4adjustedFrequencyPrep;
		if (this.channel4lastSampleLookup >= this.noiseTableLength) {
			this.channel4lastSampleLookup -= this.noiseTableLength;
		}
	}
}
GameBoyCore.prototype.audioChannelsComputeMono = function () {
	//Channel 1:
	if ((this.channel1consecutive || this.channel1totalLength > 0) && this.channel1Fault == 0) {
		this.currentSampleRight = (this.channel1lastSampleLookup <= this.channel1adjustedDuty && this.rightChannel0) ? this.channel1currentVolume : 0;
		if (this.channel1numSweep > 0) {
			if (--this.channel1timeSweep == 0) {
				--this.channel1numSweep;
				if (this.channel1decreaseSweep) {
					this.channel1ShadowFrequency -= this.channel1ShadowFrequency >> this.channel1frequencySweepDivider;
					//Pre-calculate the frequency computation outside the waveform generator for speed:
					this.channel1adjustedFrequencyPrep = this.preChewedAudioComputationMultiplier / (0x800 - this.channel1ShadowFrequency);
				}
				else {
					this.channel1ShadowFrequency += this.channel1ShadowFrequency >> this.channel1frequencySweepDivider;
					if (this.channel1ShadowFrequency <= 0x7FF) {
						//Pre-calculate the frequency computation outside the waveform generator for speed:
						this.channel1adjustedFrequencyPrep = this.preChewedAudioComputationMultiplier / (0x800 - this.channel1ShadowFrequency);
					}
					else {
						this.channel1Fault |= 0x2;
						this.memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
					}
				}
				this.channel1timeSweep = this.channel1lastTimeSweep;
			}
		}
		if (this.channel1envelopeSweeps > 0) {
			if (this.channel1volumeEnvTime > 0) {
				--this.channel1volumeEnvTime;
			}
			else {
				if (!this.channel1envelopeType) {
					if (this.channel1envelopeVolume > 0) {
						this.channel1currentVolume = --this.channel1envelopeVolume / 0x1E;
						this.channel1volumeEnvTime = this.channel1volumeEnvTimeLast;
					}
					else {
						this.channel1envelopeSweeps = 0;
					}
				}
				else if (this.channel1envelopeVolume < 0xF) {
					this.channel1currentVolume = ++this.channel1envelopeVolume / 0x1E;
					this.channel1volumeEnvTime = this.channel1volumeEnvTimeLast;
				}
				else {
					this.channel1envelopeSweeps = 0;
				}
			}
		}
		if (this.channel1totalLength > 0) {
			--this.channel1totalLength;
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
		this.currentSampleRight = 0;
	}
	//Channel 2:
	if ((this.channel2consecutive || this.channel2totalLength > 0)) {
		if (this.channel2lastSampleLookup <= this.channel2adjustedDuty && this.rightChannel1) {
			this.currentSampleRight += this.channel2currentVolume;
		}
		if (this.channel2envelopeSweeps > 0) {
			if (this.channel2volumeEnvTime > 0) {
				--this.channel2volumeEnvTime;
			}
			else {
				if (!this.channel2envelopeType) {
					if (this.channel2envelopeVolume > 0) {
						this.channel2currentVolume = --this.channel2envelopeVolume / 0x1E;
						this.channel2volumeEnvTime = this.channel2volumeEnvTimeLast;
					}
					else {
						this.channel2envelopeSweeps = 0;
					}
				}
				else if (this.channel2envelopeVolume < 0xF) {
					this.channel2currentVolume = ++this.channel2envelopeVolume / 0x1E;
					this.channel2volumeEnvTime = this.channel2volumeEnvTimeLast;
				}
				else {
					this.channel2envelopeSweeps = 0;
				}
			}
		}
		if (this.channel2totalLength > 0) {
			--this.channel2totalLength;
			if (this.channel2totalLength <= 0) {
				this.memory[0xFF26] &= 0xFD;	//Channel #2 On Flag Off
			}
		}
		this.channel2lastSampleLookup += this.channel2adjustedFrequencyPrep;
		while (this.channel2lastSampleLookup >= 1) {
			this.channel2lastSampleLookup -= 1;
		}
	}
	//Channel 3:
	if (this.channel3canPlay && (this.channel3consecutive || this.channel3totalLength > 0)) {
		if (this.channel3patternType > -0x20 && this.rightChannel2) {
			this.currentSampleRight += this.channel3PCM[this.channel3Tracker | this.channel3patternType];
		}
		this.channel3Tracker += this.channel3adjustedFrequencyPrep;
		if (this.channel3Tracker >= 0x20) {
			this.channel3Tracker -= 0x20;
		}
		if (this.channel3totalLength > 0) {
			--this.channel3totalLength;
			if (this.channel3totalLength <= 0) {
				this.memory[0xFF26] &= 0xFB;	//Channel #3 On Flag Off
			}
		}
	}
	//Channel 4:
	if (this.channel4consecutive || this.channel4totalLength > 0) {
		if (this.rightChannel3) {
			this.currentSampleRight += this.noiseSampleTable[this.channel4currentVolume | this.channel4lastSampleLookup];
		}
		if (this.channel4envelopeSweeps > 0) {
			if (this.channel4volumeEnvTime > 0) {
				--this.channel4volumeEnvTime;
			}
			else {
				if (!this.channel4envelopeType) {
					if (this.channel4envelopeVolume > 0) {
						this.channel4currentVolume = --this.channel4envelopeVolume << this.channel4VolumeShifter;
						this.channel4volumeEnvTime = this.channel4volumeEnvTimeLast;
					}
					else {
						this.channel4envelopeSweeps = 0;
					}
				}
				else if (this.channel4envelopeVolume < 0xF) {
					this.channel4currentVolume = ++this.channel4envelopeVolume << this.channel4VolumeShifter;
					this.channel4volumeEnvTime = this.channel4volumeEnvTimeLast;
				}
				else {
					this.channel4envelopeSweeps = 0;
				}
			}
		}
		if (this.channel4totalLength > 0) {
			--this.channel4totalLength;
			if (this.channel4totalLength <= 0) {
				this.memory[0xFF26] &= 0xF7;	//Channel #4 On Flag Off
			}
		}
		this.channel4lastSampleLookup += this.channel4adjustedFrequencyPrep;
		if (this.channel4lastSampleLookup >= this.noiseTableLength) {
			this.channel4lastSampleLookup -= this.noiseTableLength;
		}
	}
}
//Below are the buffer-underrun protection audio refill functions:
GameBoyCore.prototype.generateAudioSafe = function (tempBuffer, numSamples) {
	if (this.soundMasterEnabled) {
		if (!settings[1]) {						//Split Mono & Stereo into two, to avoid this if statement every iteration of the loop.
			while (--numSamples >= 0) {
				//STEREO
				this.audioChannelsComputeStereoSafe();
				tempBuffer.push(this.currentSampleLeft * this.VinLeftChannelMasterVolume - 1);
				tempBuffer.push(this.currentSampleRight * this.VinRightChannelMasterVolume - 1);
			}
		}
		else {
			while (--numSamples >= 0) {
				//MONO
				this.audioChannelsComputeMonoSafe();
				tempBuffer.push(this.currentSampleRight * this.VinRightChannelMasterVolume - 1);
			}
		}
	}
	else {
		//SILENT OUTPUT:
		if (!settings[1]) {
			while (--numSamples >= 0) {
				//STEREO
				tempBuffer.push(-1);
				tempBuffer.push(-1);
			}
		}
		else {
			while (--numSamples >= 0) {
				//MONO
				tempBuffer.push(-1);
			}
		}
	}
	return tempBuffer;
}
GameBoyCore.prototype.audioChannelsComputeStereoSafe = function () {
	//channel 1:
	if ((this.channel1consecutive || this.channel1totalLength > 0) && this.channel1Fault == 0) {
		if (this.channel1lastSampleLookup <= this.channel1adjustedDuty) {
			this.currentSampleLeft = (this.leftChannel0) ? this.channel1currentVolume : 0;
			this.currentSampleRight = (this.rightChannel0) ? this.channel1currentVolume : 0;
		}
		else {
			this.currentSampleRight = this.currentSampleLeft = 0;
		}
		this.channel1lastSampleLookup += this.channel1adjustedFrequencyPrep;
		while (this.channel1lastSampleLookup >= 1) {
			this.channel1lastSampleLookup -= 1;
		}
	}
	else {
		this.currentSampleRight = this.currentSampleLeft = 0;
	}
	//Channel 2:
	if ((this.channel2consecutive || this.channel2totalLength > 0)) {
		if (this.channel2lastSampleLookup <= this.channel2adjustedDuty) {
			if (this.leftChannel1) {
				this.currentSampleLeft += this.channel2currentVolume;
			}
			if (this.rightChannel1) {
				this.currentSampleRight += this.channel2currentVolume;
			}
		}
		this.channel2lastSampleLookup += this.channel2adjustedFrequencyPrep;
		while (this.channel2lastSampleLookup >= 1) {
			this.channel2lastSampleLookup -= 1;
		}
	}
	//Channel 3:
	if (this.channel3canPlay && (this.channel3consecutive || this.channel3totalLength > 0)) {
		if (this.channel3patternType > -0x20) {
			var PCMSample = this.channel3PCM[this.channel3Tracker | this.channel3patternType];
			if (this.leftChannel2) {
				this.currentSampleLeft += PCMSample;
			}
			if (this.rightChannel2) {
				this.currentSampleRight += PCMSample;
			}
		}
		this.channel3Tracker += this.channel3adjustedFrequencyPrep;
		if (this.channel3Tracker >= 0x20) {
			this.channel3Tracker -= 0x20;
		}
	}
	//Channel 4:
	if (this.channel4consecutive || this.channel4totalLength > 0) {
		var duty = this.noiseSampleTable[this.channel4currentVolume | this.channel4lastSampleLookup];
		if (this.leftChannel3) {
			this.currentSampleLeft += duty;
		}
		if (this.rightChannel3) {
			this.currentSampleRight += duty;
		}
		this.channel4lastSampleLookup += this.channel4adjustedFrequencyPrep;
		if (this.channel4lastSampleLookup >= this.noiseTableLength) {
			this.channel4lastSampleLookup -= this.noiseTableLength;
		}
	}
}
GameBoyCore.prototype.audioChannelsComputeMonoSafe = function () {
	//channel 1:
	if ((this.channel1consecutive || this.channel1totalLength > 0) && this.channel1Fault == 0) {
		if (this.channel1lastSampleLookup <= this.channel1adjustedDuty) {
			this.currentSampleRight = (this.rightChannel0) ? this.channel1currentVolume : 0;
		}
		else {
			this.currentSampleRight = 0;
		}
		this.channel1lastSampleLookup += this.channel1adjustedFrequencyPrep;
		while (this.channel1lastSampleLookup >= 1) {
			this.channel1lastSampleLookup -= 1;
		}
	}
	else {
		this.currentSampleRight = 0;
	}
	//Channel 2:
	if ((this.channel2consecutive || this.channel2totalLength > 0)) {
		if (this.channel2lastSampleLookup <= this.channel2adjustedDuty && this.rightChannel1) {
			this.currentSampleRight += this.channel2currentVolume;
		}
		this.channel2lastSampleLookup += this.channel2adjustedFrequencyPrep;
		while (this.channel2lastSampleLookup >= 1) {
			this.channel2lastSampleLookup -= 1;
		}
	}
	//Channel 3:
	if (this.channel3canPlay && (this.channel3consecutive || this.channel3totalLength > 0)) {
		if (this.channel3patternType > -0x20 && this.rightChannel2) {
			this.currentSampleRight += this.channel3PCM[this.channel3Tracker | this.channel3patternType];
		}
		this.channel3Tracker += this.channel3adjustedFrequencyPrep;
		if (this.channel3Tracker >= 0x20) {
			this.channel3Tracker -= 0x20;
		}
	}
	//Channel 4:
	if (this.channel4consecutive || this.channel4totalLength > 0) {
		if (this.rightChannel3) {
			this.currentSampleRight += this.noiseSampleTable[this.channel4currentVolume | this.channel4lastSampleLookup];
		}
		this.channel4lastSampleLookup += this.channel4adjustedFrequencyPrep;
		if (this.channel4lastSampleLookup >= this.noiseTableLength) {
			this.channel4lastSampleLookup -= this.noiseTableLength;
		}
	}
}
GameBoyCore.prototype.run = function () {
	//The preprocessing before the actual iteration loop:
	if ((this.stopEmulator & 2) == 0) {
		if ((this.stopEmulator & 1) == 1) {
			this.stopEmulator = 0;
			this.drewFrame = false;
			this.audioUnderrunAdjustment();
			this.clockUpdate();			//Frame skip and RTC code.
			if (!this.halt) {
				this.executeIteration();
			}
			else {						//Finish the HALT rundown execution.
				this.CPUTicks = 0;
				this.calculateHALTPeriod();
				if (this.halt) {
					this.updateCoreFull();
				}
				else {
					this.executeIteration();
				}
			}
			
		}
		else {		//We can only get here if there was an internal error, but the loop was restarted.
			cout("Iterator restarted a faulted core.", 2);
			pause();
		}
	}
}
GameBoyCore.prototype.executeIteration = function () {
	//Iterate the interpreter loop:
	var opcodeToExecute = 0;
	while (this.stopEmulator == 0) {
		//Interrupt Arming:
		switch (this.IRQEnableDelay) {
			case 1:
				this.IME = true;
				this.checkIRQMatching();
			case 2:
				--this.IRQEnableDelay;
		}
		//Is an IRQ set to fire?:
		if (this.IRQLineMatched > 0) {
			//IME is true and and interrupt was matched:
			this.launchIRQ();
		}
		//Fetch the current opcode:
		opcodeToExecute = this.memoryReader[this.programCounter](this, this.programCounter);
		//Increment the program counter to the next instruction:
		this.programCounter = (this.programCounter + 1) & 0xFFFF;
		//Check for the program counter quirk:
		if (this.skipPCIncrement) {
			this.programCounter = (this.programCounter - 1) & 0xFFFF;
			this.skipPCIncrement = false;
		}
		//Get how many CPU cycles the current instruction counts for:
		this.CPUTicks = this.TICKTable[opcodeToExecute];
		//Execute the current instruction:
		this.OPCODE[opcodeToExecute](this);
		//Update the state:
		this.updateCoreFull();
	}
}
GameBoyCore.prototype.iterationEndRoutine = function () {
	if ((this.stopEmulator & 0x1) == 0) {
		this.audioJIT();	//Make sure we at least output once per iteration.
		//Update DIV Alignment (Integer overflow safety):
		this.memory[0xFF04] = (this.memory[0xFF04] + (this.DIVTicks >> 8)) & 0xFF;
		this.DIVTicks &= 0xFF;
		//Update emulator flags:
		this.stopEmulator |= 1;			//End current loop.
		this.emulatorTicks -= this.CPUCyclesTotal;
		this.CPUCyclesTotalCurrent += this.CPUCyclesTotalRoundoff;
		this.recalculateIterationClockLimit();
	}
}
GameBoyCore.prototype.recalculateIterationClockLimit = function () {
	var endModulus = this.CPUCyclesTotalCurrent % 4;
	this.CPUCyclesTotal = this.CPUCyclesTotalBase + this.CPUCyclesTotalCurrent - endModulus;
	this.CPUCyclesTotalCurrent = endModulus;
}
GameBoyCore.prototype.scanLineMode2 = function () {	//OAM Search Period
	if (this.STATTracker != 1) {
		if (this.mode2TriggerSTAT) {
			this.interruptsRequested |= 0x2;
			this.checkIRQMatching();
		}
		this.STATTracker = 1;
		this.modeSTAT = 2;
	}
}
GameBoyCore.prototype.scanLineMode3 = function () {	//Scan Line Drawing Period
	if (this.modeSTAT != 3) {
		if (this.STATTracker == 0 && this.mode2TriggerSTAT) {
			this.interruptsRequested |= 0x2;
			this.checkIRQMatching();
		}
		this.STATTracker = 1;
		this.modeSTAT = 3;
	}
}
GameBoyCore.prototype.scanLineMode0 = function () {	//Horizontal Blanking Period
	if (this.modeSTAT != 0) {
		if (this.STATTracker != 2) {
			if (this.STATTracker == 0) {
				if (this.mode2TriggerSTAT) {
					this.interruptsRequested |= 0x2;
					this.checkIRQMatching();
				}
				this.modeSTAT = 3;
			}
			this.renderScanLine();
			this.STATTracker = 2;
		}
		if (this.LCDTicks >= this.spriteCount) {
			if (this.hdmaRunning) {
				this.executeHDMA();
			}
			if (this.mode0TriggerSTAT) {
				this.interruptsRequested |= 0x2;
				this.checkIRQMatching();
			}
			this.STATTracker = 3;
			this.modeSTAT = 0;
		}
	}
}
GameBoyCore.prototype.clocksUntilLYCMatch = function () {
	if (this.memory[0xFF45] != 0) {
		if (this.memory[0xFF45] > this.actualScanLine) {
			return 456 * (this.memory[0xFF45] - this.actualScanLine);
		}
		return 456 * (154 - this.actualScanLine + this.memory[0xFF45]);
	}
	return (456 * ((this.actualScanLine == 153 && this.memory[0xFF44] == 0) ? 154 : (153 - this.actualScanLine))) + 8;
}
GameBoyCore.prototype.clocksUntilMode0 = function () {
	switch (this.modeSTAT) {
		case 0:
			if (this.actualScanLine == 143) {
				this.updateSpriteCount(0);
				return this.spriteCount + 5016;
			}
			this.updateSpriteCount(this.actualScanLine + 1);
			return this.spriteCount + 456;
		case 2:
		case 3:
			this.updateSpriteCount(this.actualScanLine);
			return this.spriteCount;
		case 1:
			this.updateSpriteCount(0);
			return this.spriteCount + (456 * (154 - this.actualScanLine));
	}
}
GameBoyCore.prototype.updateSpriteCount = function (line) {
	this.spriteCount = 252;
	if (this.cGBC && this.gfxSpriteShow) {										//Is the window enabled and are we in CGB mode?
		var lineAdjusted = line + 0x10;
		var yoffset = 0;
		var yCap = (this.gfxSpriteNormalHeight) ? 0x8 : 0x10;
		for (var OAMAddress = 0xFE00; OAMAddress < 0xFEA0 && this.spriteCount < 312; OAMAddress += 4) {
			yoffset = lineAdjusted - this.memory[OAMAddress];
			if (yoffset > -1 && yoffset < yCap) {
				this.spriteCount += 6;
			}
		}
	}
}
GameBoyCore.prototype.matchLYC = function () {	//LYC Register Compare
	if (this.memory[0xFF44] == this.memory[0xFF45]) {
		this.memory[0xFF41] |= 0x04;
		if (this.LYCMatchTriggerSTAT) {
			this.interruptsRequested |= 0x2;
			this.checkIRQMatching();
		}
	} 
	else {
		this.memory[0xFF41] &= 0x7B;
	}
}
GameBoyCore.prototype.updateCore = function () {
	//Update the clocking for the LCD emulation:
	this.LCDTicks += this.CPUTicks >> this.doubleSpeedShifter;	//LCD Timing
	this.LCDCONTROL[this.actualScanLine](this);					//Scan Line and STAT Mode Control
	//Single-speed relative timing for A/V emulation:
	var timedTicks = this.CPUTicks >> this.doubleSpeedShifter;	//CPU clocking can be updated from the LCD handling.
	this.audioTicks += timedTicks;								//Audio Timing
	this.emulatorTicks += timedTicks;							//Emulator Timing
	//CPU Timers:
	this.DIVTicks += this.CPUTicks;								//DIV Timing
	if (this.TIMAEnabled) {										//TIMA Timing
		this.timerTicks += this.CPUTicks;
		while (this.timerTicks >= this.TACClocker) {
			this.timerTicks -= this.TACClocker;
			if (++this.memory[0xFF05] == 0x100) {
				this.memory[0xFF05] = this.memory[0xFF06];
				this.interruptsRequested |= 0x4;
				this.checkIRQMatching();
			}
		}
	}
	if (this.serialTimer > 0) {										//Serial Timing
		//IRQ Counter:
		this.serialTimer -= this.CPUTicks;
		if (this.serialTimer <= 0) {
			this.interruptsRequested |= 0x8;
			this.checkIRQMatching();
		}
		//Bit Shit Counter:
		this.serialShiftTimer -= this.CPUTicks;
		if (this.serialShiftTimer <= 0) {
			this.serialShiftTimer = this.serialShiftTimerAllocated;
			this.memory[0xFF01] = ((this.memory[0xFF01] << 1) & 0xFE) | 0x01;	//We could shift in actual link data here if we were to implement such!!!
		}
	}
}
GameBoyCore.prototype.updateCoreFull = function () {
	//Update the state machine:
	this.updateCore();
	//End of iteration routine:
	if (this.emulatorTicks >= this.CPUCyclesTotal) {
		this.iterationEndRoutine();
	}
}
GameBoyCore.prototype.initializeLCDController = function () {
	//Display on hanlding:
	var line = 0;
	while (line < 154) {
		if (line < 143) {
			//We're on a normal scan line:
			this.LINECONTROL[line] = function (parentObj) {
				if (parentObj.LCDTicks < 80) {
					parentObj.scanLineMode2();
				}
				else if (parentObj.LCDTicks < 252) {
					parentObj.scanLineMode3();
				}
				else if (parentObj.LCDTicks < 456) {
					parentObj.scanLineMode0();
				}
				else {
					//We're on a new scan line:
					parentObj.LCDTicks -= 456;
					if (parentObj.STATTracker != 3) {
						//Make sure the mode 0 handler was run at least once per scan line:
						if (parentObj.STATTracker != 2) {
							if (parentObj.STATTracker == 0 && parentObj.mode2TriggerSTAT) {
								parentObj.interruptsRequested |= 0x2;
							}
							parentObj.renderScanLine();
						}
						if (parentObj.hdmaRunning) {
							parentObj.executeHDMA();
						}
						if (parentObj.mode0TriggerSTAT) {
							parentObj.interruptsRequested |= 0x2;
						}
					}
					//Update the scanline registers and assert the LYC counter:
					parentObj.actualScanLine = ++parentObj.memory[0xFF44];
					//Perform a LYC counter assert:
					if (parentObj.actualScanLine == parentObj.memory[0xFF45]) {
						parentObj.memory[0xFF41] |= 0x04;
						if (parentObj.LYCMatchTriggerSTAT) {
							parentObj.interruptsRequested |= 0x2;
						}
					} 
					else {
						parentObj.memory[0xFF41] &= 0x7B;
					}
					parentObj.checkIRQMatching();
					//Reset our mode contingency variables:
					parentObj.STATTracker = 0;
					parentObj.modeSTAT = 2;
					parentObj.LINECONTROL[parentObj.actualScanLine](parentObj);	//Scan Line and STAT Mode Control.
				}
			}
		}
		else if (line == 143) {
			//We're on the last visible scan line of the LCD screen:
			this.LINECONTROL[143] = function (parentObj) {
				if (parentObj.LCDTicks < 80) {
					parentObj.scanLineMode2();
				}
				else if (parentObj.LCDTicks < 252) {
					parentObj.scanLineMode3();
				}
				else if (parentObj.LCDTicks < 456) {
					parentObj.scanLineMode0();
				}
				else {
					//Starting V-Blank:
					//Just finished the last visible scan line:
					parentObj.LCDTicks -= 456;
					if (parentObj.STATTracker != 3) {
						//Make sure the mode 0 handler was run at least once per scan line:
						if (parentObj.STATTracker != 2) {
							if (parentObj.STATTracker == 0 && parentObj.mode2TriggerSTAT) {
								parentObj.interruptsRequested |= 0x2;
							}
							parentObj.renderScanLine();
						}
						if (parentObj.hdmaRunning) {
							parentObj.executeHDMA();
						}
						if (parentObj.mode0TriggerSTAT) {
							parentObj.interruptsRequested |= 0x2;
						}
					}
					//Update the scanline registers and assert the LYC counter:
					parentObj.actualScanLine = parentObj.memory[0xFF44] = 144;
					//Perform a LYC counter assert:
					if (parentObj.memory[0xFF45] == 144) {
						parentObj.memory[0xFF41] |= 0x04;
						if (parentObj.LYCMatchTriggerSTAT) {
							parentObj.interruptsRequested |= 0x2;
						}
					} 
					else {
						parentObj.memory[0xFF41] &= 0x7B;
					}
					//Reset our mode contingency variables:
					parentObj.STATTracker = 0;
					//Update our state for v-blank:
					parentObj.modeSTAT = 1;
					parentObj.interruptsRequested |= (parentObj.mode1TriggerSTAT) ? 0x3 : 0x1;
					parentObj.checkIRQMatching();
					//Attempt to blit out to our canvas:
					if (parentObj.drewBlank == 0) {
						//Draw the frame:
						parentObj.drawToCanvas();
					}
					else {
						//LCD off takes at least 2 frames:
						--parentObj.drewBlank;
					}
					parentObj.LINECONTROL[144](parentObj);	//Scan Line and STAT Mode Control.
				}
			}
		}
		else if (line < 153) {
			//In VBlank
			this.LINECONTROL[line] = function (parentObj) {
				if (parentObj.LCDTicks >= 456) {
					//We're on a new scan line:
					parentObj.LCDTicks -= 456;
					parentObj.actualScanLine = ++parentObj.memory[0xFF44];
					//Perform a LYC counter assert:
					if (parentObj.actualScanLine == parentObj.memory[0xFF45]) {
						parentObj.memory[0xFF41] |= 0x04;
						if (parentObj.LYCMatchTriggerSTAT) {
							parentObj.interruptsRequested |= 0x2;
							parentObj.checkIRQMatching();
						}
					} 
					else {
						parentObj.memory[0xFF41] &= 0x7B;
					}
					parentObj.LINECONTROL[parentObj.actualScanLine](parentObj);	//Scan Line and STAT Mode Control.
				}
			}
		}
		else {
			//VBlank Ending (We're on the last actual scan line)
			this.LINECONTROL[153] = function (parentObj) {
				if (parentObj.LCDTicks >= 8) {
					if (parentObj.STATTracker != 4 && parentObj.memory[0xFF44] == 153) {
						parentObj.memory[0xFF44] = 0;	//LY register resets to 0 early.
						//Perform a LYC counter assert:
						if (parentObj.memory[0xFF45] == 0) {
							parentObj.memory[0xFF41] |= 0x04;
							if (parentObj.LYCMatchTriggerSTAT) {
								parentObj.interruptsRequested |= 0x2;
								parentObj.checkIRQMatching();
							}
						} 
						else {
							parentObj.memory[0xFF41] &= 0x7B;
						}
						parentObj.STATTracker = 4;
					}
					if (parentObj.LCDTicks >= 456) {
						//We reset back to the beginning:
						parentObj.LCDTicks -= 456;
						parentObj.STATTracker = parentObj.actualScanLine = 0;
						parentObj.LINECONTROL[0](parentObj);	//Scan Line and STAT Mode Control.
					}
				}
			}
		}
		++line;
	}
}
GameBoyCore.prototype.DisplayShowOff = function () {
	this.drewBlank = 2;
	this.prepareFrame();
}
GameBoyCore.prototype.executeHDMA = function () {
	this.DMAWrite(1);
	if (this.halt) {
		if ((this.LCDTicks - this.spriteCount) < ((4 >> this.doubleSpeedShifter) | 0x20)) {
			//HALT clocking correction:
			this.CPUTicks = 4 + ((0x20 + this.spriteCount) << this.doubleSpeedShifter);
			this.LCDTicks = this.spriteCount + ((4 >> this.doubleSpeedShifter) | 0x20);
		}
	}
	else {
		this.LCDTicks += (4 >> this.doubleSpeedShifter) | 0x20;			//LCD Timing Update For HDMA.
	}
	if (this.memory[0xFF55] == 0) {
		this.hdmaRunning = false;
		this.memory[0xFF55] = 0xFF;	//Transfer completed ("Hidden last step," since some ROMs don't imply this, but most do).
	}
	else {
		--this.memory[0xFF55];
	}
}
GameBoyCore.prototype.clockUpdate = function () {
	//We're tying in the same timer for RTC and frame skipping, since we can and this reduces load.
	if (settings[7] || this.cTIMER) {
		var dateObj = new Date();
		var newTime = dateObj.getTime();
		var timeElapsed = newTime - this.lastIteration;	//Get the numnber of milliseconds since this last executed.
		this.lastIteration = newTime;
		if (this.cTIMER && !this.RTCHALT) {
			//Update the MBC3 RTC:
			this.RTCSeconds += timeElapsed / 1000;
			while (this.RTCSeconds >= 60) {	//System can stutter, so the seconds difference can get large, thus the "while".
				this.RTCSeconds -= 60;
				++this.RTCMinutes;
				if (this.RTCMinutes >= 60) {
					this.RTCMinutes -= 60;
					++this.RTCHours;
					if (this.RTCHours >= 24) {
						this.RTCHours -= 24
						++this.RTCDays;
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
			++this.iterations;
			if (timeElapsed > settings[6] && ((newTime - this.firstIteration) / this.iterations) > (settings[6] + 1 + (settings[6] / this.iterations))) {
				//Did not finish in time...
				if (settings[4] < settings[8]) {
					++settings[4];
				}
			}
			else if (settings[4] > 0) {
				//We finished on time, decrease frame skipping (throttle to somewhere just below full speed)...
				--settings[4];
			}
			if (this.iterations > 200) {
				this.iterations = 0;
				this.firstIteration = newTime;
			}
		}
	}
}
GameBoyCore.prototype.drawToCanvas = function () {
	//Draw the frame buffer to the canvas:
	if (!this.drewFrame && this.pixelCount > 0) {	//Throttle blitting to once per interpreter loop iteration.
		if (settings[4] == 0 || this.frameCount > 0) {
			//Copy and convert the framebuffer data to the CanvasPixelArray format.
			this.prepareFrame();
			if (settings[4] > 0) {
				//Increment the frameskip counter:
				this.frameCount -= settings[4];
			}
			this.drewFrame = true;
		}
		else {
			//Reset the frameskip counter:
			this.frameCount += settings[12];
		}
	}
}
GameBoyCore.prototype.prepareFrame = function () {
	if (this.drewBlank == 0) {
		if (settings[18] && this.width != 160 && this.height != 144) {
			this.resizeFrameBuffer();
		}
		else {
			var frameBuffer = this.frameBuffer;
			var frame = this.completeFrame;
			var length = frameBuffer.length;
			for (var index = 0; index < length; ++index) {
				frame[index] = frameBuffer[index];
			}
		}
	}
	if (!settings[11]) {
		//If we have not detected v-blank timing support, then we'll just blit now:
		this.dispatchDraw();
	}
	//Request a v-blank event to occur:
	requestVBlank(this.canvas);
}
GameBoyCore.prototype.dispatchDraw = function () {
	if (this.drewBlank == 0) {
		this.swizzleFrameBuffer();
	}
	else {
		this.drawBlankScreen();
	}
}
GameBoyCore.prototype.swizzleFrameBuffer = function () {
	var frameBuffer = this.completeFrame;
	var bufferIndex = this.pixelCount;
	var canvasData = this.canvasBuffer.data;
	var canvasIndex = this.rgbCount;
	while (canvasIndex > 3) {
		canvasData[canvasIndex -= 4] = (frameBuffer[--bufferIndex] >> 16) & 0xFF;		//Red
		canvasData[canvasIndex + 1] = (frameBuffer[bufferIndex] >> 8) & 0xFF;			//Green
		canvasData[canvasIndex + 2] = frameBuffer[bufferIndex] & 0xFF;					//Blue
	}
	//Draw out the CanvasPixelArray data:
	this.drawContext.putImageData(this.canvasBuffer, 0, 0);
}
GameBoyCore.prototype.drawBlankScreen = function () {
	this.drawContext.fillStyle = (this.cGBC || this.colorizedGBPalettes) ? "rgb(248, 248, 248)" : "rgb(239, 255, 222)";
	this.drawContext.fillRect(0, 0, this.width, this.height);
}
GameBoyCore.prototype.compileResizeFrameBufferFunction = function () {
	//Attempt to resize the canvas in software instead of in CSS:
	if (settings[13]) {
		//JIT version:
		var column = -1;
		var columnOffset = 0;
		var heightRatio = this.heightRatio;
		var widthRatio = this.widthRatio;
		var height = this.height;
		var width = this.width;
		var compileStringArray = [];
		var compileStringIndex = 1;
		compileStringArray[0] = "var a=this.frameBuffer,b=this.completeFrame";
		for (var row = 0, rowOffset = 0, pixelOffset = -1; row < height; rowOffset = ((++row * heightRatio) | 0) * 160) {
			for (column = -1, columnOffset = 0; ++column < width; columnOffset += widthRatio) {
				compileStringArray[++compileStringIndex] = "b[" + (++pixelOffset) + "]=a[" + (rowOffset + (columnOffset | 0)) + "]";
			}
		}
		compileStringArray[compileStringIndex + 1] = "return b";
		this.resizeFrameBuffer = new Function(compileStringArray.join(";"));
	}
	else {
		//Runtime resolving version:
		this.resizeFrameBuffer = function () {
			var column = -1;
			var columnOffset = 0;
			var targetFB = this.completeFrame;
			var originalFB = this.frameBuffer;
			var heightRatio = this.heightRatio;
			var widthRatio = this.widthRatio;
			var height = this.height;
			var width = this.width;
			for (var row = 0, rowOffset = 0, pixelOffset = -1; row < height; rowOffset = ((++row * heightRatio) | 0) * 160) {
				for (column = -1, columnOffset = 0; ++column < width; columnOffset += widthRatio) {
					targetFB[++pixelOffset] = originalFB[rowOffset + (columnOffset | 0)];
				}
			}
			return targetFB;
		}
	}
}
GameBoyCore.prototype.renderScanLine = function () {
	this.spriteCount = 252;		//Reset the extra clocking for STAT mode 3.
	if (settings[4] == 0 || this.frameCount > 0) {
		this.pixelStart = this.actualScanLine * 160;
		if (this.bgEnabled) {
			this.BGLayerRender(160);
			this.WindowLayerRender(160);
		}
		else {
			var pixelLine = (this.actualScanLine + 1) * 160;
			var defaultColor = (this.cGBC || this.colorizedGBPalettes) ? 0xF8F8F8 : 0xEFFFDE;
			for (var pixelPosition = (this.actualScanLine * 160) + this.currentX; pixelPosition < pixelLine; pixelPosition++) {
				this.frameBuffer[pixelPosition] = defaultColor;
			}
		}
		this.SpriteLayerRender();
	}
	else {
		//Extra clocking of mode3 for CGB still needs to be done, even when we frameskip:
		this.updateSpriteCount(this.actualScanLine);
	}
	this.currentX = 0;
	this.midScanlineOffset = -1;
}
GameBoyCore.prototype.renderMidScanLine = function () {
	if (this.actualScanLine < 144 && this.modeSTAT == 3 && (settings[4] == 0 || this.frameCount > 0)) {
		//TODO: Get this accurate:
		if (this.midScanlineOffset == -1) {
			this.midScanlineOffset = this.memory[0xFF43] & 0x7;
		}
		if (this.LCDTicks >= 82) {
			var pixelEnd = this.LCDTicks - 74;
			pixelEnd = Math.min(pixelEnd - this.midScanlineOffset - (pixelEnd % 0x8), 160);
			if (this.bgEnabled) {
				this.pixelStart = this.actualScanLine * 160;
				this.BGLayerRender(pixelEnd);
				this.WindowLayerRender(pixelEnd);
				//TODO: Do midscanline JIT for sprites...
			}
			else {
				var pixelLine = (this.actualScanLine * 160) + pixelEnd;
				var defaultColor = (this.cGBC || this.colorizedGBPalettes) ? 0xF8F8F8 : 0xEFFFDE;
				for (var pixelPosition = (this.actualScanLine * 160) + this.currentX; pixelPosition < pixelLine; pixelPosition++) {
					this.frameBuffer[pixelPosition] = defaultColor;
				}
			}
			this.currentX = pixelEnd;
		}
	}
}
GameBoyCore.prototype.initializeModeSpecificArrays = function () {
	this.LCDCONTROL = (this.LCDisOn) ? this.LINECONTROL : this.DISPLAYOFFCONTROL;
	if (this.cGBC) {
		this.gbcOBJRawPalette = this.getTypedArray(0x40, 0, "uint8");
		this.gbcBGRawPalette = this.getTypedArray(0x40, 0, "uint8");
		this.gbcOBJPalette = this.getTypedArray(0x20, 0x1000000, "int32");
		this.gbcBGPalette = this.getTypedArray(0x20, 0, "int32");
		this.BGCHRBank2 = this.getTypedArray(0x800, 0, "uint8");
		this.BGCHRCurrentBank = (this.currVRAMBank > 0) ? this.BGCHRBank2 : this.BGCHRBank1;
		this.tileCache = this.generateCacheArray(0xF80);
		this.tileCacheValid = this.getTypedArray(0xF80, 0, "int8");
	}
	else {
		this.gbOBJPalette = this.getTypedArray(8, 0x1000000, "int32");
		this.gbBGPalette = this.getTypedArray(4, 0, "int32");
		this.BGPalette = this.gbBGPalette;
		this.OBJPalette = this.gbOBJPalette;
		this.tileCache = this.generateCacheArray(0x700);
		this.tileCacheValid = this.getTypedArray(0x700, 0, "int8");
	}
	this.renderPathBuild();
}
GameBoyCore.prototype.GBCtoGBModeAdjust = function () {
	cout("Stepping down from GBC mode.", 0);
	this.tileCache = this.generateCacheArray(0x700);
	this.tileCacheValid = this.getTypedArray(0x700, 0, "int8");
	this.VRAM = this.GBCMemory = this.BGCHRCurrentBank = this.BGCHRBank2 = null;
	if (settings[17]) {
		this.gbBGColorizedPalette = this.getTypedArray(4, 0, "int32");
		this.gbOBJColorizedPalette = this.getTypedArray(8, 0, "int32");
		this.cachedBGPaletteConversion = this.getTypedArray(4, 0, "int32");
		this.cachedOBJPaletteConversion = this.getTypedArray(8, 0, "int32");
		this.BGPalette = this.gbBGColorizedPalette;
		this.OBJPalette = this.gbOBJColorizedPalette;
		this.gbOBJPalette = this.gbBGPalette = null;
		this.getGBCColor();
	}
	else {
		this.gbOBJPalette = this.getTypedArray(8, 0x1000000, "int32");
		this.gbBGPalette = this.getTypedArray(4, 0, "int32");
		this.BGPalette = this.gbBGPalette;
		this.OBJPalette = this.gbOBJPalette;
	}
	this.resetOAMXCache();
	this.renderPathBuild();
	this.memoryReadJumpCompile();
	this.memoryWriteJumpCompile();
}
GameBoyCore.prototype.renderPathBuild = function () {
	if (!this.cGBC) {
		this.BGLayerRender = this.BGGBLayerRender;
		this.WindowLayerRender = this.WindowGBLayerRender;
		this.SpriteLayerRender = this.SpriteGBLayerRender;
	}
	else {
		this.BGLayerRender = this.BGGBCLayerRender;
		this.WindowLayerRender = this.WindowGBCLayerRender;
		this.SpriteLayerRender = this.SpriteGBCLayerRender;
	}
}
GameBoyCore.prototype.initializeReferencesFromSaveState = function () {
	this.LCDCONTROL = (this.LCDisOn) ? this.LINECONTROL : this.DISPLAYOFFCONTROL;
	if (!this.cGBC) {
		if (this.colorizedGBPalettes) {
			this.BGPalette = this.gbBGColorizedPalette;
			this.OBJPalette = this.gbOBJColorizedPalette;
			this.updateGBBGPalette = this.updateGBColorizedBGPalette;
			this.updateGBOBJPalette = this.updateGBColorizedOBJPalette;
		}
		else {
			this.BGPalette = this.gbBGPalette;
			this.OBJPalette = this.gbOBJPalette;
		}
	}
	else {
		this.BGCHRCurrentBank = (this.currVRAMBank > 0) ? this.BGCHRBank2 : this.BGCHRBank1;
	}
	this.renderPathBuild();
}
GameBoyCore.prototype.RGBTint = function (value) {
	//Adjustment for the GBC's tinting (According to Gambatte):
	var r = value & 0x1F;
	var g = (value >> 5) & 0x1F;
	var b = (value >> 10) & 0x1F;
	return ((r * 13 + g * 2 + b) >> 1) << 16 | (g * 3 + b) << 9 | (r * 3 + g * 2 + b * 11) >> 1;
}
GameBoyCore.prototype.getGBCColor = function () {
	//GBC Colorization of DMG ROMs:
	//BG
	for (var counter = 0; counter < 4; counter++) {
		var adjustedIndex = counter << 1;
		//BG
		this.cachedBGPaletteConversion[counter] = this.RGBTint((this.gbcBGRawPalette[adjustedIndex | 1] << 8) | this.gbcBGRawPalette[adjustedIndex]);
		//OBJ 1
		this.cachedOBJPaletteConversion[counter] = 0x1000000 | this.RGBTint((this.gbcOBJRawPalette[adjustedIndex | 1] << 8) | this.gbcOBJRawPalette[adjustedIndex]);
	}
	//OBJ 2
	for (counter = 4; counter < 8; counter++) {
		adjustedIndex = counter << 1;
		this.cachedOBJPaletteConversion[counter] = 0x1000000 | this.RGBTint((this.gbcOBJRawPalette[adjustedIndex | 1] << 8) | this.gbcOBJRawPalette[adjustedIndex]);
	}
	//Update the palette entries:
	this.updateGBBGPalette = this.updateGBColorizedBGPalette;
	this.updateGBOBJPalette = this.updateGBColorizedOBJPalette;
	this.updateGBBGPalette(this.memory[0xFF47]);
	this.updateGBOBJPalette(0, this.memory[0xFF48]);
	this.updateGBOBJPalette(1, this.memory[0xFF49]);
	this.colorizedGBPalettes = true;
}
GameBoyCore.prototype.updateGBRegularBGPalette = function (data) {
	this.gbBGPalette[0] = this.colors[data & 0x03] | 0x2000000;
	this.gbBGPalette[1] = this.colors[(data >> 2) & 0x03];
	this.gbBGPalette[2] = this.colors[(data >> 4) & 0x03];
	this.gbBGPalette[3] = this.colors[data >> 6];
}
GameBoyCore.prototype.updateGBColorizedBGPalette = function (data) {
	//GB colorization:
	this.gbBGColorizedPalette[0] = this.cachedBGPaletteConversion[data & 0x03] | 0x2000000;
	this.gbBGColorizedPalette[1] = this.cachedBGPaletteConversion[(data >> 2) & 0x03];
	this.gbBGColorizedPalette[2] = this.cachedBGPaletteConversion[(data >> 4) & 0x03];
	this.gbBGColorizedPalette[3] = this.cachedBGPaletteConversion[data >> 6];
}
GameBoyCore.prototype.updateGBRegularOBJPalette = function (index, data) {
	this.gbOBJPalette[index | 1] = this.objColors[(data >> 2) & 0x03];
	this.gbOBJPalette[index | 2] = this.objColors[(data >> 4) & 0x03];
	this.gbOBJPalette[index | 3] = this.objColors[data >> 6];
}
GameBoyCore.prototype.updateGBColorizedOBJPalette = function (index, data) {
	//GB colorization:
	this.gbOBJColorizedPalette[index | 1] = this.cachedOBJPaletteConversion[index | ((data >> 2) & 0x03)];
	this.gbOBJColorizedPalette[index | 2] = this.cachedOBJPaletteConversion[index | ((data >> 4) & 0x03)];
	this.gbOBJColorizedPalette[index | 3] = this.cachedOBJPaletteConversion[index | (data >> 6)];
}
GameBoyCore.prototype.updateGBCBGPalette = function (index, data) {
	if (this.gbcBGRawPalette[index] != data) {
		this.renderMidScanLine();
		//Update the color palette for BG tiles since it changed:
		this.gbcBGRawPalette[index] = data;
		if ((index & 0x06) == 0) {
			//Palette 0 (Special tile Priority stuff)
			this.gbcBGPalette[index >> 1] = 0x2000000 | this.RGBTint((this.gbcBGRawPalette[index | 1] << 8) | this.gbcBGRawPalette[index & 0x3E]);
		}
		else {
			//Regular Palettes (No special crap)
			this.gbcBGPalette[index >> 1] = this.RGBTint((this.gbcBGRawPalette[index | 1] << 8) | this.gbcBGRawPalette[index & 0x3E]);
		}
	}
}
GameBoyCore.prototype.updateGBCOBJPalette = function (index, data) {
	if (this.gbcOBJRawPalette[index] != data) {
		//Update the color palette for OBJ tiles since it changed:
		this.gbcOBJRawPalette[index] = data;
		if ((index & 0x06) > 0) {
			//Regular Palettes (No special crap)
			this.renderMidScanLine();
			this.gbcOBJPalette[index >> 1] = 0x1000000 | this.RGBTint((this.gbcOBJRawPalette[index | 1] << 8) | this.gbcOBJRawPalette[index & 0x3E]);
		}
	}
}
GameBoyCore.prototype.BGGBLayerRender = function (pixelEnd) {
	var scrollYAdjusted = (this.memory[0xFF42] + this.actualScanLine) & 0xFF;				//The line of the BG we're at.
	var tileYLine = (scrollYAdjusted & 7) << 3;
	var tileYDown = this.gfxBackgroundCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2);	//The row of cached tiles we're fetching from.
	var scrollXAdjusted = (this.memory[0xFF43] + this.currentX) & 0xFF;						//The scroll amount of the BG.
	var pixelPosition = this.pixelStart + this.currentX;									//Current pixel we're working on.
	var pixelPositionEnd = this.pixelStart + ((this.gfxWindowDisplay && (this.actualScanLine - this.windowY) >= 0) ? Math.min(Math.max(this.windowX, 0) + this.currentX, pixelEnd) : pixelEnd);	//Make sure we do at most 160 pixels a scanline.
	var tileNumber = tileYDown + (scrollXAdjusted >> 3);
	var chrCode = this.BGCHRBank1[tileNumber];
	if (chrCode < this.gfxBackgroundBankOffset) {
		chrCode |= 0x100;
	}
	var tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBTile(chrCode);
	for (var texel = (scrollXAdjusted & 0x7); texel < 8 && pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
		this.frameBuffer[pixelPosition++] = this.BGPalette[tile[tileYLine | texel++]];
	}
	var scrollXAdjustedAligned = Math.min(pixelPositionEnd - pixelPosition, 0x100 - scrollXAdjusted) >> 3;
	scrollXAdjusted += scrollXAdjustedAligned << 3;
	scrollXAdjustedAligned += tileNumber;
	while (tileNumber < scrollXAdjustedAligned) {
		chrCode = this.BGCHRBank1[++tileNumber];
		if (chrCode < this.gfxBackgroundBankOffset) {
			chrCode |= 0x100;
		}
		tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBTile(chrCode);
		for (texel = 0; texel < 8; ++texel) {
			this.frameBuffer[pixelPosition++] = this.BGPalette[tile[tileYLine | texel]];
		}
	}
	if (pixelPosition < pixelPositionEnd) {
		if (scrollXAdjusted < 0x100) {
			chrCode = this.BGCHRBank1[++tileNumber];
			if (chrCode < this.gfxBackgroundBankOffset) {
				chrCode |= 0x100;
			}
			tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBTile(chrCode);
			for (texel = tileYLine - 1; pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
				this.frameBuffer[pixelPosition++] = this.BGPalette[tile[++texel]];
			}
		}
		scrollXAdjustedAligned = ((pixelPositionEnd - pixelPosition) >> 3) + tileYDown;
		while (tileYDown < scrollXAdjustedAligned) {
			chrCode = this.BGCHRBank1[tileYDown++];
			if (chrCode < this.gfxBackgroundBankOffset) {
				chrCode |= 0x100;
			}
			tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBTile(chrCode);
			for (texel = 0; texel < 8; ++texel) {
				this.frameBuffer[pixelPosition++] = this.BGPalette[tile[tileYLine | texel]];
			}
		}
		if (pixelPosition < pixelPositionEnd) {
			chrCode = this.BGCHRBank1[tileYDown];
			if (chrCode < this.gfxBackgroundBankOffset) {
				chrCode |= 0x100;
			}
			tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBTile(chrCode);
			switch (pixelPositionEnd - pixelPosition) {
				case 7:
					this.frameBuffer[pixelPosition + 6] = this.BGPalette[tile[tileYLine | 6]];
				case 6:
					this.frameBuffer[pixelPosition + 5] = this.BGPalette[tile[tileYLine | 5]];
				case 5:
					this.frameBuffer[pixelPosition + 4] = this.BGPalette[tile[tileYLine | 4]];
				case 4:
					this.frameBuffer[pixelPosition + 3] = this.BGPalette[tile[tileYLine | 3]];
				case 3:
					this.frameBuffer[pixelPosition + 2] = this.BGPalette[tile[tileYLine | 2]];
				case 2:
					this.frameBuffer[pixelPosition + 1] = this.BGPalette[tile[tileYLine | 1]];
				case 1:
					this.frameBuffer[pixelPosition] = this.BGPalette[tile[tileYLine]];
			}
		}
	}
}
GameBoyCore.prototype.BGGBCLayerRender = function (pixelEnd) {
	var scrollYAdjusted = (this.memory[0xFF42] + this.actualScanLine) & 0xFF;				//The line of the BG we're at.
	var tileYLine = (scrollYAdjusted & 7) << 3;
	var tileYDown = this.gfxBackgroundCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2);	//The row of cached tiles we're fetching from.
	var scrollXAdjusted = (this.memory[0xFF43] + this.currentX) & 0xFF;						//The scroll amount of the BG.
	var pixelPosition = this.pixelStart + this.currentX;									//Current pixel we're working on.
	var pixelPositionEnd = this.pixelStart + ((this.gfxWindowDisplay && (this.actualScanLine - this.windowY) >= 0) ? Math.min(Math.max(this.windowX, 0) + this.currentX, pixelEnd) : pixelEnd);	//Make sure we do at most 160 pixels a scanline.
	var tileNumber = tileYDown + (scrollXAdjusted >> 3);
	var chrCode = this.BGCHRBank1[tileNumber];
	if (chrCode < this.gfxBackgroundBankOffset) {
		chrCode |= 0x100;
	}
	var attrCode = this.BGCHRBank2[tileNumber];
	chrCode |= ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5);
	var tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBCTile(attrCode, chrCode);
	var pixelFlag = (attrCode << 17) & this.BGPriorityEnabled;
	var palette = (attrCode & 0x7) << 2;
	for (var texel = (scrollXAdjusted & 0x7); texel < 8 && pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
		this.frameBuffer[pixelPosition++] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | texel++]];
	}
	var scrollXAdjustedAligned = Math.min(pixelPositionEnd - pixelPosition, 0x100 - scrollXAdjusted) >> 3;
	scrollXAdjusted += scrollXAdjustedAligned << 3;
	scrollXAdjustedAligned += tileNumber;
	while (tileNumber < scrollXAdjustedAligned) {
		chrCode = this.BGCHRBank1[++tileNumber];
		if (chrCode < this.gfxBackgroundBankOffset) {
			chrCode |= 0x100;
		}
		attrCode = this.BGCHRBank2[tileNumber];
		chrCode |= ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5);
		tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBCTile(attrCode, chrCode);
		pixelFlag = (attrCode << 17) & this.BGPriorityEnabled;
		palette = (attrCode & 0x7) << 2;
		for (texel = 0; texel < 8; ++texel) {
			this.frameBuffer[pixelPosition++] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | texel]];
		}
	}
	if (pixelPosition < pixelPositionEnd) {
		if (scrollXAdjusted < 0x100) {
			chrCode = this.BGCHRBank1[++tileNumber];
			if (chrCode < this.gfxBackgroundBankOffset) {
				chrCode |= 0x100;
			}
			attrCode = this.BGCHRBank2[tileNumber];
			chrCode |= ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5);
			tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBCTile(attrCode, chrCode);
			pixelFlag = (attrCode << 17) & this.BGPriorityEnabled;
			palette = (attrCode & 0x7) << 2;
			for (texel = tileYLine - 1; pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
				this.frameBuffer[pixelPosition++] = pixelFlag | this.gbcBGPalette[palette | tile[++texel]];
			}
		}
		scrollXAdjustedAligned = ((pixelPositionEnd - pixelPosition) >> 3) + tileYDown;
		while (tileYDown < scrollXAdjustedAligned) {
			chrCode = this.BGCHRBank1[tileYDown];
			if (chrCode < this.gfxBackgroundBankOffset) {
				chrCode |= 0x100;
			}
			attrCode = this.BGCHRBank2[tileYDown++];
			chrCode |= ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5);
			tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBCTile(attrCode, chrCode);
			pixelFlag = (attrCode << 17) & this.BGPriorityEnabled;
			palette = (attrCode & 0x7) << 2;
			for (texel = 0; texel < 8; ++texel) {
				this.frameBuffer[pixelPosition++] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | texel]];
			}
		}
		if (pixelPosition < pixelPositionEnd) {
			chrCode = this.BGCHRBank1[tileYDown];
			if (chrCode < this.gfxBackgroundBankOffset) {
				chrCode |= 0x100;
			}
			attrCode = this.BGCHRBank2[tileYDown];
			chrCode |= ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5);
			tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBCTile(attrCode, chrCode);
			pixelFlag = (attrCode << 17) & this.BGPriorityEnabled;
			palette = (attrCode & 0x7) << 2;
			switch (pixelPositionEnd - pixelPosition) {
				case 7:
					this.frameBuffer[pixelPosition + 6] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 6]];
				case 6:
					this.frameBuffer[pixelPosition + 5] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 5]];
				case 5:
					this.frameBuffer[pixelPosition + 4] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 4]];
				case 4:
					this.frameBuffer[pixelPosition + 3] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 3]];
				case 3:
					this.frameBuffer[pixelPosition + 2] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 2]];
				case 2:
					this.frameBuffer[pixelPosition + 1] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 1]];
				case 1:
					this.frameBuffer[pixelPosition] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine]];
			}
		}
	}
}
GameBoyCore.prototype.WindowGBLayerRender = function (pixelEnd) {
	if (this.gfxWindowDisplay) {									//Is the window enabled?
		var scrollYAdjusted = this.actualScanLine - this.windowY;	//The line of the BG we're at.
		if (scrollYAdjusted >= 0) {
			var scrollXRangeAdjusted = (this.windowX > 0) ? (this.windowX + this.currentX) : this.currentX;
			var pixelPosition = this.pixelStart + scrollXRangeAdjusted;
			var pixelPositionEnd = this.pixelStart + pixelEnd;
			if (pixelPosition < pixelPositionEnd) {
				var tileYLine = (scrollYAdjusted & 0x7) << 3;
				var tileNumber = (this.gfxWindowCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2)) + (this.currentX >> 3);
				var chrCode = this.BGCHRBank1[tileNumber];
				if (chrCode < this.gfxBackgroundBankOffset) {
					chrCode |= 0x100;
				}
				var tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBTile(chrCode);
				var texel = (scrollXRangeAdjusted - this.windowX) & 0x7;
				scrollXRangeAdjusted = Math.min(8, texel + pixelPositionEnd - pixelPosition);
				while (texel < scrollXRangeAdjusted) {
					this.frameBuffer[pixelPosition++] = this.BGPalette[tile[tileYLine | texel++]];
				}
				scrollXRangeAdjusted = tileNumber + ((pixelPositionEnd - pixelPosition) >> 3);
				while (tileNumber < scrollXRangeAdjusted) {
					chrCode = this.BGCHRBank1[++tileNumber];
					if (chrCode < this.gfxBackgroundBankOffset) {
						chrCode |= 0x100;
					}
					tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBTile(chrCode);
					for (texel = 0; texel < 8; ++texel) {
						this.frameBuffer[pixelPosition++] = this.BGPalette[tile[tileYLine | texel]];
					}
				}
				if (pixelPosition < pixelPositionEnd) {
					chrCode = this.BGCHRBank1[++tileNumber];
					if (chrCode < this.gfxBackgroundBankOffset) {
						chrCode |= 0x100;
					}
					tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBTile(chrCode);
					switch (pixelPositionEnd - pixelPosition) {
						case 7:
							this.frameBuffer[pixelPosition + 6] = this.BGPalette[tile[tileYLine | 6]];
						case 6:
							this.frameBuffer[pixelPosition + 5] = this.BGPalette[tile[tileYLine | 5]];
						case 5:
							this.frameBuffer[pixelPosition + 4] = this.BGPalette[tile[tileYLine | 4]];
						case 4:
							this.frameBuffer[pixelPosition + 3] = this.BGPalette[tile[tileYLine | 3]];
						case 3:
							this.frameBuffer[pixelPosition + 2] = this.BGPalette[tile[tileYLine | 2]];
						case 2:
							this.frameBuffer[pixelPosition + 1] = this.BGPalette[tile[tileYLine | 1]];
						case 1:
							this.frameBuffer[pixelPosition] = this.BGPalette[tile[tileYLine]];
					}
				}
			}
		}
	}
}
GameBoyCore.prototype.WindowGBCLayerRender = function (pixelEnd) {
	if (this.gfxWindowDisplay) {									//Is the window enabled?
		var scrollYAdjusted = this.actualScanLine - this.windowY;	//The line of the BG we're at.
		if (scrollYAdjusted >= 0) {
			var scrollXRangeAdjusted = (this.windowX > 0) ? (this.windowX + this.currentX) : this.currentX;
			var pixelPosition = this.pixelStart + scrollXRangeAdjusted;
			var pixelPositionEnd = this.pixelStart + pixelEnd;
			if (pixelPosition < pixelPositionEnd) {
				var tileYLine = (scrollYAdjusted & 0x7) << 3;
				var tileNumber = (this.gfxWindowCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2)) + (this.currentX >> 3);
				var chrCode = this.BGCHRBank1[tileNumber];
				if (chrCode < this.gfxBackgroundBankOffset) {
					chrCode |= 0x100;
				}
				var attrCode = this.BGCHRBank2[tileNumber];
				chrCode |= ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5);
				var tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBCTile(attrCode, chrCode);
				var pixelFlag = (attrCode << 17) & this.BGPriorityEnabled;
				var palette = (attrCode & 0x7) << 2;
				var texel = (scrollXRangeAdjusted - this.windowX) & 0x7;
				scrollXRangeAdjusted = Math.min(8, texel + pixelPositionEnd - pixelPosition);
				while (texel < scrollXRangeAdjusted) {
					this.frameBuffer[pixelPosition++] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | texel++]];
				}
				scrollXRangeAdjusted = tileNumber + ((pixelPositionEnd - pixelPosition) >> 3);
				while (tileNumber < scrollXRangeAdjusted) {
					chrCode = this.BGCHRBank1[++tileNumber];
					if (chrCode < this.gfxBackgroundBankOffset) {
						chrCode |= 0x100;
					}
					attrCode = this.BGCHRBank2[tileNumber];
					chrCode |= ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5);
					tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBCTile(attrCode, chrCode);
					pixelFlag = (attrCode << 17) & this.BGPriorityEnabled;
					palette = (attrCode & 0x7) << 2;
					for (texel = 0; texel < 8; ++texel) {
						this.frameBuffer[pixelPosition++] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | texel]];
					}
				}
				if (pixelPosition < pixelPositionEnd) {
					chrCode = this.BGCHRBank1[++tileNumber];
					if (chrCode < this.gfxBackgroundBankOffset) {
						chrCode |= 0x100;
					}
					attrCode = this.BGCHRBank2[tileNumber];
					chrCode |= ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5);
					tile = (this.tileCacheValid[chrCode] == 1) ? this.tileCache[chrCode] : this.generateGBCTile(attrCode, chrCode);
					pixelFlag = (attrCode << 17) & this.BGPriorityEnabled;
					palette = (attrCode & 0x7) << 2;
					switch (pixelPositionEnd - pixelPosition) {
						case 7:
							this.frameBuffer[pixelPosition + 6] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 6]];
						case 6:
							this.frameBuffer[pixelPosition + 5] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 5]];
						case 5:
							this.frameBuffer[pixelPosition + 4] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 4]];
						case 4:
							this.frameBuffer[pixelPosition + 3] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 3]];
						case 3:
							this.frameBuffer[pixelPosition + 2] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 2]];
						case 2:
							this.frameBuffer[pixelPosition + 1] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine | 1]];
						case 1:
							this.frameBuffer[pixelPosition] = pixelFlag | this.gbcBGPalette[palette | tile[tileYLine]];
					}
				}
			}
		}
	}
}
GameBoyCore.prototype.SpriteGBLayerRender = function () {
	if (this.gfxSpriteShow) {										//Are sprites enabled?
		var lineAdjusted = this.actualScanLine + 0x10;
		var OAMAddress = 0xFE00;
		var yoffset = 0;
		var xcoord = 0;
		var attrCode = 0;
		var palette = 0;
		var tileNumber = 0;
		var tile = null;
		var data = 0;
		var spriteCount = 0;
		var currentColumn = 0;
		var length = 0;
		var currentPixel = 0;
		var onXCoord = 1;
		var pixelOffsetLocal = this.pixelStart;
		if (this.gfxSpriteNormalHeight) {
			//Draw the visible sprites:
			for (var lowestSpriteAddress = this.findLowestSpriteDrawable(); onXCoord < 8; ++onXCoord) {
				currentColumn = this.OAMAddresses[onXCoord];
				length = currentColumn.length;
				for (spriteCount = 0; spriteCount < length; ++spriteCount) {
					OAMAddress = currentColumn[spriteCount];
					if (OAMAddress < lowestSpriteAddress) {
						yoffset = lineAdjusted - this.memory[OAMAddress];
						if ((yoffset & 0x7) == yoffset) {
							yoffset <<= 3;
							attrCode = this.memory[OAMAddress | 3];
							palette = (attrCode & 0x10) >> 2;
							tileNumber = ((attrCode & 0x60) << 4) | this.memory[OAMAddress | 0x2];
							tile = (this.tileCacheValid[tileNumber] == 1) ? this.tileCache[tileNumber] : this.generateGBOAMTile(attrCode, tileNumber);
							for (xcoord = 8 - onXCoord, currentPixel = pixelOffsetLocal; xcoord < 8; ++xcoord, ++currentPixel) {
								if (this.frameBuffer[currentPixel] >= 0x2000000) {
									data = tile[yoffset | xcoord];
									if (data > 0) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
								else if (this.frameBuffer[currentPixel] < 0x1000000) {
									data = tile[yoffset | xcoord];
									if (data > 0 && attrCode < 0x80) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
							}
						}
					}
				}
			}
			for (pixelOffsetLocal -= 8; onXCoord < 161; ++onXCoord) {
				currentColumn = this.OAMAddresses[onXCoord];
				length = currentColumn.length;
				for (spriteCount = 0; spriteCount < length; ++spriteCount) {
					OAMAddress = currentColumn[spriteCount];
					if (OAMAddress < lowestSpriteAddress) {
						yoffset = lineAdjusted - this.memory[OAMAddress];
						if ((yoffset & 0x7) == yoffset) {
							yoffset <<= 3;
							attrCode = this.memory[OAMAddress | 3];
							palette = (attrCode & 0x10) >> 2;
							tileNumber = ((attrCode & 0x60) << 4) | this.memory[OAMAddress | 0x2];
							tile = (this.tileCacheValid[tileNumber] == 1) ? this.tileCache[tileNumber] : this.generateGBOAMTile(attrCode, tileNumber);
							for (xcoord = 0, currentPixel = pixelOffsetLocal + onXCoord; xcoord < 8; ++xcoord, ++currentPixel) {
								if (this.frameBuffer[currentPixel] >= 0x2000000) {
									data = tile[yoffset | xcoord];
									if (data > 0) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
								else if (this.frameBuffer[currentPixel] < 0x1000000) {
									data = tile[yoffset | xcoord];
									if (data > 0 && attrCode < 0x80) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
							}
						}
					}
				}
			}
			for (pixelOffsetLocal += 167; onXCoord < 168; ++onXCoord) {
				currentColumn = this.OAMAddresses[onXCoord];
				length = currentColumn.length;
				for (spriteCount = 0; spriteCount < length; ++spriteCount) {
					OAMAddress = currentColumn[spriteCount];
					if (OAMAddress < lowestSpriteAddress) {
						yoffset = lineAdjusted - this.memory[OAMAddress];
						if ((yoffset & 0x7) == yoffset) {
							yoffset <<= 3;
							attrCode = this.memory[OAMAddress | 3];
							palette = (attrCode & 0x10) >> 2;
							tileNumber = ((attrCode & 0x60) << 4) | this.memory[OAMAddress | 0x2];
							tile = (this.tileCacheValid[tileNumber] == 1) ? this.tileCache[tileNumber] : this.generateGBOAMTile(attrCode, tileNumber);
							for (xcoord = 167 - onXCoord, currentPixel = pixelOffsetLocal; xcoord > -1; --xcoord, --currentPixel) {
								if (this.frameBuffer[currentPixel] >= 0x2000000) {
									data = tile[yoffset | xcoord];
									if (data > 0) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
								else if (this.frameBuffer[currentPixel] < 0x1000000) {
									data = tile[yoffset | xcoord];
									if (data > 0 && attrCode < 0x80) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
							}
						}
					}
				}
			}
		}
		else {
			//Draw the visible sprites:
			for (var lowestSpriteAddress = this.findLowestSpriteDoubleDrawable(); onXCoord < 8; ++onXCoord) {
				currentColumn = this.OAMAddresses[onXCoord];
				length = currentColumn.length;
				for (spriteCount = 0; spriteCount < length; ++spriteCount) {
					OAMAddress = currentColumn[spriteCount];
					if (OAMAddress < lowestSpriteAddress) {
						yoffset = lineAdjusted - this.memory[OAMAddress];
						if ((yoffset & 0xF) == yoffset) {
							attrCode = this.memory[OAMAddress | 0x3];
							palette = (attrCode & 0x10) >> 2;
							if ((attrCode & 0x40) == (0x40 & (yoffset << 3))) {
								tileNumber = ((attrCode & 0x60) << 4) | (this.memory[OAMAddress | 0x2] & 0xFE);
							}
							else {
								tileNumber = ((attrCode & 0x60) << 4) | this.memory[OAMAddress | 0x2] | 1;
							}
							yoffset = (yoffset & 0x7) << 3;
							tile = (this.tileCacheValid[tileNumber] == 1) ? this.tileCache[tileNumber] : this.generateGBOAMTile(attrCode, tileNumber);
							for (xcoord = 8 - onXCoord, currentPixel = pixelOffsetLocal; xcoord < 8; ++xcoord, ++currentPixel) {
								if (this.frameBuffer[currentPixel] >= 0x2000000) {
									data = tile[yoffset | xcoord];
									if (data > 0) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
								else if (this.frameBuffer[currentPixel] < 0x1000000) {
									data = tile[yoffset | xcoord];
									if (data > 0 && attrCode < 0x80) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
							}
						}
					}
				}
			}
			for (pixelOffsetLocal -= 8; onXCoord < 161; ++onXCoord) {
				currentColumn = this.OAMAddresses[onXCoord];
				length = currentColumn.length;
				for (spriteCount = 0; spriteCount < length; ++spriteCount) {
					OAMAddress = currentColumn[spriteCount];
					if (OAMAddress < lowestSpriteAddress) {
						yoffset = lineAdjusted - this.memory[OAMAddress];
						if ((yoffset & 0xF) == yoffset) {
							attrCode = this.memory[OAMAddress | 0x3];
							palette = (attrCode & 0x10) >> 2;
							if ((attrCode & 0x40) == (0x40 & (yoffset << 3))) {
								tileNumber = ((attrCode & 0x60) << 4) | (this.memory[OAMAddress | 0x2] & 0xFE);
							}
							else {
								tileNumber = ((attrCode & 0x60) << 4) | this.memory[OAMAddress | 0x2] | 1;
							}
							yoffset = (yoffset & 0x7) << 3;
							tile = (this.tileCacheValid[tileNumber] == 1) ? this.tileCache[tileNumber] : this.generateGBOAMTile(attrCode, tileNumber);
							for (xcoord = 0, currentPixel = pixelOffsetLocal + onXCoord; xcoord < 8; ++xcoord, ++currentPixel) {
								if (this.frameBuffer[currentPixel] >= 0x2000000) {
									data = tile[yoffset | xcoord];
									if (data > 0) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
								else if (this.frameBuffer[currentPixel] < 0x1000000) {
									data = tile[yoffset | xcoord];
									if (data > 0 && attrCode < 0x80) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
							}
						}
					}
				}
			}
			for (pixelOffsetLocal += 167; onXCoord < 168; ++onXCoord) {
				currentColumn = this.OAMAddresses[onXCoord];
				length = currentColumn.length;
				for (spriteCount = 0; spriteCount < length; ++spriteCount) {
					OAMAddress = currentColumn[spriteCount];
					if (OAMAddress < lowestSpriteAddress) {
						yoffset = lineAdjusted - this.memory[OAMAddress];
						if ((yoffset & 0xF) == yoffset) {
							attrCode = this.memory[OAMAddress | 0x3];
							palette = (attrCode & 0x10) >> 2;
							if ((attrCode & 0x40) == (0x40 & (yoffset << 3))) {
								tileNumber = ((attrCode & 0x60) << 4) | (this.memory[OAMAddress | 0x2] & 0xFE);
							}
							else {
								tileNumber = ((attrCode & 0x60) << 4) | this.memory[OAMAddress | 0x2] | 1;
							}
							yoffset = (yoffset & 0x7) << 3;
							tile = (this.tileCacheValid[tileNumber] == 1) ? this.tileCache[tileNumber] : this.generateGBOAMTile(attrCode, tileNumber);
							for (xcoord = 167 - onXCoord, currentPixel = pixelOffsetLocal; xcoord > -1; --xcoord, --currentPixel) {
								if (this.frameBuffer[currentPixel] >= 0x2000000) {
									data = tile[yoffset | xcoord];
									if (data > 0) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
								else if (this.frameBuffer[currentPixel] < 0x1000000) {
									data = tile[yoffset | xcoord];
									if (data > 0 && attrCode < 0x80) {
										this.frameBuffer[currentPixel] = this.OBJPalette[palette | data];
									}
								}
							}
						}
					}
				}
			}
		}
	}
}
GameBoyCore.prototype.findLowestSpriteDrawable = function () {
	var address = 0xFE00;
	var spriteCount = 0;
	var line = this.actualScanLine + 0x10;
	var diff = 0;
	while (address < 0xFEA0 && spriteCount < 10) {
		diff = line - this.memory[address];
		if (diff > -1 && diff < 0x8) {
			++spriteCount;
		}
		address += 4;
	}
	return address;
}
GameBoyCore.prototype.findLowestSpriteDoubleDrawable = function () {
	var address = 0xFE00;
	var spriteCount = 0;
	var line = this.actualScanLine + 0x10;
	var diff = 0;
	while (address < 0xFEA0 && spriteCount < 10) {
		diff = line - this.memory[address];
		if (diff > -1 && diff < 0x10) {
			++spriteCount;
		}
		address += 4;
	}
	return address;
}
GameBoyCore.prototype.SpriteGBCLayerRender = function () {
	if (this.gfxSpriteShow) {										//Are sprites enabled?
		var OAMAddress = 0xFE00;
		var lineAdjusted = this.actualScanLine + 0x10;
		var yoffset = 0;
		var xcoord = 0;
		var endX = 0;
		var xCounter = 0;
		var attrCode = 0;
		var palette = 0;
		var tileNumber = 0;
		var tile = null;
		var data = 0;
		var currentPixel = 0;
		if (this.gfxSpriteNormalHeight) {
			for (; OAMAddress < 0xFEA0 && this.spriteCount < 312; OAMAddress += 4) {
				yoffset = lineAdjusted - this.memory[OAMAddress];
				if ((yoffset & 0x7) == yoffset) {
					xcoord = this.memory[OAMAddress | 1] - 8;
					endX = Math.min(160, xcoord + 8);
					attrCode = this.memory[OAMAddress | 3];
					palette = (attrCode & 7) << 2;
					tileNumber = ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5) | this.memory[OAMAddress | 2];
					tile = ((this.tileCacheValid[tileNumber] == 1) ? this.tileCache[tileNumber] : this.generateGBCTile(attrCode, tileNumber));
					xCounter = (xcoord > 0) ? xcoord : 0;
					xcoord -= yoffset << 3;
					for (currentPixel = this.pixelStart + xCounter; xCounter < endX; ++xCounter, ++currentPixel) {
						if (this.frameBuffer[currentPixel] >= 0x2000000) {
							data = tile[xCounter - xcoord];
							if (data > 0) {
								this.frameBuffer[currentPixel] = this.gbcOBJPalette[palette | data];
							}
						}
						else if (this.frameBuffer[currentPixel] < 0x1000000) {
							data = tile[xCounter - xcoord];
							if (data > 0 && attrCode < 0x80) {		//Don't optimize for attrCode, as LICM-capable JITs should optimize its checks.
								this.frameBuffer[currentPixel] = this.gbcOBJPalette[palette | data];
							}
						}
					}
					this.spriteCount += 6;
				}
			}
		}
		else {
			for (; OAMAddress < 0xFEA0 && this.spriteCount < 312; OAMAddress += 4) {
				yoffset = lineAdjusted - this.memory[OAMAddress];
				if ((yoffset & 0xF) == yoffset) {
					xcoord = this.memory[OAMAddress | 1] - 8;
					endX = Math.min(160, xcoord + 8);
					attrCode = this.memory[OAMAddress | 3];
					palette = (attrCode & 7) << 2;
					if ((attrCode & 0x40) == (0x40 & (yoffset << 3))) {
						tileNumber = ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5) | (this.memory[OAMAddress | 0x2] & 0xFE);
					}
					else {
						tileNumber = ((attrCode & 0x08) << 6) | ((attrCode & 0x60) << 5) | this.memory[OAMAddress | 0x2] | 1;
					}
					tile = ((this.tileCacheValid[tileNumber] == 1) ? this.tileCache[tileNumber] : this.generateGBCTile(attrCode, tileNumber));
					xCounter = (xcoord > 0) ? xcoord : 0;
					xcoord -= (yoffset & 0x7) << 3;
					for (currentPixel = this.pixelStart + xCounter; xCounter < endX; ++xCounter, ++currentPixel) {
						if (this.frameBuffer[currentPixel] >= 0x2000000) {
							data = tile[xCounter - xcoord];
							if (data > 0) {
								this.frameBuffer[currentPixel] = this.gbcOBJPalette[palette | data];
							}
						}
						else if (this.frameBuffer[currentPixel] < 0x1000000) {
							data = tile[xCounter - xcoord];
							if (data > 0 && attrCode < 0x80) {		//Don't optimize for attrCode, as LICM-capable JITs should optimize its checks.
								this.frameBuffer[currentPixel] = this.gbcOBJPalette[palette | data];
							}
						}
					}
					this.spriteCount += 6;
				}
			}
		}
	}
}
//Generate a tile for the tile cache for DMG's BG+WINDOW:
GameBoyCore.prototype.generateGBTile = function (tile) {
	//Set lookup address to the beginning of the target tile:
	var address = 0x8000 | (tile << 4);
	//Get a reference to the tile:
	var tileBlock = this.tileCache[tile];
	//Data only from bank 0 with no flipping:
	var lineIndex = 0;
	var lineCopy = 0;
	do {
		//Copy the two bytes that make up a tile's line:
		lineCopy = (this.memory[0x1 | address] << 8) | this.memory[address];
		//Each pixel is composed of two bits: MSB is in the second byte, while the LSB is in the first byte.
		//Normal copy (no flip) for a line is in the RTL (right-to-left) format:
		tileBlock[lineIndex | 7] = ((lineCopy & 0x100) >> 7) | (lineCopy & 0x1);
		tileBlock[lineIndex | 6] = ((lineCopy & 0x200) >> 8) | ((lineCopy & 0x2) >> 1);
		tileBlock[lineIndex | 5] = ((lineCopy & 0x400) >> 9) | ((lineCopy & 0x4) >> 2);
		tileBlock[lineIndex | 4] = ((lineCopy & 0x800) >> 10) | ((lineCopy & 0x8) >> 3);
		tileBlock[lineIndex | 3] = ((lineCopy & 0x1000) >> 11) | ((lineCopy & 0x10) >> 4);
		tileBlock[lineIndex | 2] = ((lineCopy & 0x2000) >> 12) | ((lineCopy & 0x20) >> 5);
		tileBlock[lineIndex | 1] = ((lineCopy & 0x4000) >> 13) | ((lineCopy & 0x40) >> 6);
		tileBlock[lineIndex] = ((lineCopy & 0x8000) >> 14) | ((lineCopy & 0x80) >> 7);
		address += 2;
		lineIndex += 8;
	} while (lineIndex < 64);
	//Set flag for the tile in the cache to valid:
	this.tileCacheValid[tile] = 1;
	//Return the obtained tile to the rendering path:
	return tileBlock;
}
//Generate a tile for the tile cache for all CGB graphics planes:
GameBoyCore.prototype.generateGBCTile = function (map, tile) {
	var tileBlock = this.tileCache[tile];	//Reference to the 8x8 tile.
	var tileRawLine = 0;					//Unconverted line data.
	if ((map & 8) == 0) {
		//Start address of the tile:
		var address = 0x8000 | ((tile & 0x1FF) << 4);
		//Set the copy address as bank 0:
		var memoryBank = this.memory;
	}
	else {
		//Start address of the tile:
		var address = (tile & 0x1FF) << 4;
		//Set the copy address as bank 1:
		var memoryBank = this.VRAM;
	}
	//Some tile flipping initialization:
	if ((map & 0x40) == 0x40) {
		//Normal Y:
		var y = 56;
		var yINC = -8;
	}
	else {
		//Flipped Y:
		var y = 0;
		var yINC = 8;
	}
	var lineIndex = 0;
	if ((map & 0x20) == 0) {
		//Normal X:
		do {
			//Copy the new tile data:
			tileRawLine = (memoryBank[address | 0x1] << 8) | memoryBank[address];
			//Each pixel is composed of two bits: MSB is in the second byte, while the LSB is in the first byte.
			tileBlock[y | 7] = ((tileRawLine & 0x100) >> 7) | (tileRawLine & 0x1);
			tileBlock[y | 6] = ((tileRawLine & 0x200) >> 8) | ((tileRawLine & 0x2) >> 1);
			tileBlock[y | 5] = ((tileRawLine & 0x400) >> 9) | ((tileRawLine & 0x4) >> 2);
			tileBlock[y | 4] = ((tileRawLine & 0x800) >> 10) | ((tileRawLine & 0x8) >> 3);
			tileBlock[y | 3] = ((tileRawLine & 0x1000) >> 11) | ((tileRawLine & 0x10) >> 4);
			tileBlock[y | 2] = ((tileRawLine & 0x2000) >> 12) | ((tileRawLine & 0x20) >> 5);
			tileBlock[y | 1] = ((tileRawLine & 0x4000) >> 13) | ((tileRawLine & 0x40) >> 6);
			tileBlock[y] = ((tileRawLine & 0x8000) >> 14) | ((tileRawLine & 0x80) >> 7);
			y += yINC;
			address += 2;
		} while (++lineIndex < 8);
	}
	else {
		//Flipped X:
		do {
			//Copy the new tile data:
			tileRawLine = (memoryBank[address | 0x1] << 8) | memoryBank[address];
			//Each pixel is composed of two bits: MSB is in the second byte, while the LSB is in the first byte.
			tileBlock[y] = ((tileRawLine & 0x100) >> 7) | (tileRawLine & 0x1);
			tileBlock[y | 1] = ((tileRawLine & 0x200) >> 8) | ((tileRawLine & 0x2) >> 1);
			tileBlock[y | 2] = ((tileRawLine & 0x400) >> 9) | ((tileRawLine & 0x4) >> 2);
			tileBlock[y | 3] = ((tileRawLine & 0x800) >> 10) | ((tileRawLine & 0x8) >> 3);
			tileBlock[y | 4] = ((tileRawLine & 0x1000) >> 11) | ((tileRawLine & 0x10) >> 4);
			tileBlock[y | 5] = ((tileRawLine & 0x2000) >> 12) | ((tileRawLine & 0x20) >> 5);
			tileBlock[y | 6] = ((tileRawLine & 0x4000) >> 13) | ((tileRawLine & 0x40) >> 6);
			tileBlock[y | 7] = ((tileRawLine & 0x8000) >> 14) | ((tileRawLine & 0x80) >> 7);
			y += yINC;
			address += 2;
		} while (++lineIndex < 8);
	}
	//Set flag for the tile in the cache to valid:
	this.tileCacheValid[tile] = 1;
	//Return the obtained tile to the rendering path:
	return tileBlock;
}
//Generate a tile for the tile cache for DMG's sprites:
GameBoyCore.prototype.generateGBOAMTile = function (map, tile) {
	var address = 0x8000 | ((tile & 0x1FF) << 4);	//Start address of the tile.
	var tileBlock = this.tileCache[tile];			//Reference to the 8x8 tile.
	var tileRawLine = 0;							//Unconverted line data.
	if ((map & 0x40) == 0x40) {
		//Normal Y:
		var y = 56;
		var yINC = -8;
	}
	else {
		//Flipped Y:
		var y = 0;
		var yINC = 8;
	}
	var lineIndex = 0;	//Line line we're working on.
	if ((map & 0x20) == 0) {
		//Normal X:
		do {
			//Copy data from bank 0:
			tileRawLine = (this.memory[address | 0x1] << 8) | this.memory[address];
			//Each pixel is composed of two bits: MSB is in the second byte, while the LSB is in the first byte.
			tileBlock[y | 7] = ((tileRawLine & 0x100) >> 7) | (tileRawLine & 0x1);
			tileBlock[y | 6] = ((tileRawLine & 0x200) >> 8) | ((tileRawLine & 0x2) >> 1);
			tileBlock[y | 5] = ((tileRawLine & 0x400) >> 9) | ((tileRawLine & 0x4) >> 2);
			tileBlock[y | 4] = ((tileRawLine & 0x800) >> 10) | ((tileRawLine & 0x8) >> 3);
			tileBlock[y | 3] = ((tileRawLine & 0x1000) >> 11) | ((tileRawLine & 0x10) >> 4);
			tileBlock[y | 2] = ((tileRawLine & 0x2000) >> 12) | ((tileRawLine & 0x20) >> 5);
			tileBlock[y | 1] = ((tileRawLine & 0x4000) >> 13) | ((tileRawLine & 0x40) >> 6);
			tileBlock[y] = ((tileRawLine & 0x8000) >> 14) | ((tileRawLine & 0x80) >> 7);
			y += yINC;
			address += 2;
		} while (++lineIndex < 8);
	}
	else {
		//Flipped X:
		do {
			//Copy data from bank 0:
			tileRawLine = (this.memory[address | 0x1] << 8) | this.memory[address];
			//Each pixel is composed of two bits: MSB is in the second byte, while the LSB is in the first byte.
			tileBlock[y] = ((tileRawLine & 0x100) >> 7) | (tileRawLine & 0x1);
			tileBlock[y | 1] = ((tileRawLine & 0x200) >> 8) | ((tileRawLine & 0x2) >> 1);
			tileBlock[y | 2] = ((tileRawLine & 0x400) >> 9) | ((tileRawLine & 0x4) >> 2);
			tileBlock[y | 3] = ((tileRawLine & 0x800) >> 10) | ((tileRawLine & 0x8) >> 3);
			tileBlock[y | 4] = ((tileRawLine & 0x1000) >> 11) | ((tileRawLine & 0x10) >> 4);
			tileBlock[y | 5] = ((tileRawLine & 0x2000) >> 12) | ((tileRawLine & 0x20) >> 5);
			tileBlock[y | 6] = ((tileRawLine & 0x4000) >> 13) | ((tileRawLine & 0x40) >> 6);
			tileBlock[y | 7] = ((tileRawLine & 0x8000) >> 14) | ((tileRawLine & 0x80) >> 7);
			y += yINC;
			address += 2;
		} while (++lineIndex < 8);
	}
	//Set flag for the tile in the cache to valid:
	this.tileCacheValid[tile] = 1;
	//Return the obtained tile to the rendering path:
	return tileBlock;
}
//Check for the highest priority IRQ to fire:
GameBoyCore.prototype.launchIRQ = function () {
	var bitShift = 0;
	var testbit = 1;
	do {
		//Check to see if an interrupt is enabled AND requested.
		if ((testbit & this.IRQLineMatched) == testbit) {
			this.IME = false;						//Reset the interrupt enabling.
			this.interruptsRequested -= testbit;	//Reset the interrupt request.
			this.IRQLineMatched = 0;				//Reset the IRQ assertion.
			//Interrupts have a certain clock cycle length:
			this.CPUTicks = 20;
			//Set the stack pointer to the current program counter value:
			this.stackPointer = (this.stackPointer - 1) & 0xFFFF;
			this.memoryWriter[this.stackPointer](this, this.stackPointer, this.programCounter >> 8);
			this.stackPointer = (this.stackPointer - 1) & 0xFFFF;
			this.memoryWriter[this.stackPointer](this, this.stackPointer, this.programCounter & 0xFF);
			//Set the program counter to the interrupt's address:
			this.programCounter = 0x40 | (bitShift << 3);
			//Clock the core for mid-instruction updates:
			this.updateCore();
			return;									//We only want the highest priority interrupt.
		}
		testbit = 1 << ++bitShift;
	} while (bitShift < 5);
}
/*
	Check for IRQs to be fired while not in HALT:
*/
GameBoyCore.prototype.checkIRQMatching = function () {
	if (this.IME) {
		this.IRQLineMatched = this.interruptsEnabled & this.interruptsRequested & 0x1F;
	}
}
/*
	Handle the HALT opcode by predicting all IRQ cases correctly,
	then selecting the next closest IRQ firing from the prediction to
	clock up to. This prevents hacky looping that doesn't predict, but
	instead just clocks through the core update procedure by one which
	is very slow. Not many emulators do this because they have to cover
	all the IRQ prediction cases and they usually get them wrong.
*/
GameBoyCore.prototype.calculateHALTPeriod = function () {
	//Initialize our variables and start our prediction:
	if (!this.halt) {
		this.halt = true;
		var currentClocks = -1;
		var temp_var = 0;
		if (this.LCDisOn) {
			//If the LCD is enabled, then predict the LCD IRQs enabled:
			if ((this.interruptsEnabled & 0x1) == 0x1) {
				currentClocks = ((456 * (((this.modeSTAT == 1) ? 298 : 144) - this.actualScanLine)) - this.LCDTicks) << this.doubleSpeedShifter;
			}
			if ((this.interruptsEnabled & 0x2) == 0x2) {
				if (this.mode0TriggerSTAT) {
					temp_var = (this.clocksUntilMode0() - this.LCDTicks) << this.doubleSpeedShifter;
					if (temp_var <= currentClocks || currentClocks == -1) {
						currentClocks = temp_var;
					}
				}
				if (this.mode1TriggerSTAT && (this.interruptsEnabled & 0x1) == 0) {
					temp_var = ((456 * (((this.modeSTAT == 1) ? 298 : 144) - this.actualScanLine)) - this.LCDTicks) << this.doubleSpeedShifter;
					if (temp_var <= currentClocks || currentClocks == -1) {
						currentClocks = temp_var;
					}
				}
				if (this.mode2TriggerSTAT) {
					temp_var = (((this.actualScanLine >= 143) ? (456 * (154 - this.actualScanLine)) : 456) - this.LCDTicks) << this.doubleSpeedShifter;
					if (temp_var <= currentClocks || currentClocks == -1) {
						currentClocks = temp_var;
					}
				}
				if (this.LYCMatchTriggerSTAT && this.memory[0xFF45] <= 153) {
					temp_var = (this.clocksUntilLYCMatch() - this.LCDTicks) << this.doubleSpeedShifter;
					if (temp_var <= currentClocks || currentClocks == -1) {
						currentClocks = temp_var;
					}
				}
			}
		}
		if (this.TIMAEnabled && (this.interruptsEnabled & 0x4) == 0x4) {
			//CPU timer IRQ prediction:
			temp_var = ((0x100 - this.memory[0xFF05]) * this.TACClocker) - this.timerTicks;
			if (temp_var <= currentClocks || currentClocks == -1) {
				currentClocks = temp_var;
			}
		}
		if (this.serialTimer > 0 && (this.interruptsEnabled & 0x8) == 0x8) {
			//Serial IRQ prediction:
			if (this.serialTimer <= currentClocks || currentClocks == -1) {
				currentClocks = this.serialTimer;
			}
		}
	}
	else {
		var currentClocks = this.remainingClocks;
	}
	var maxClocks = (this.CPUCyclesTotal - this.emulatorTicks) << this.doubleSpeedShifter;
	if (currentClocks >= 0) {
		if (currentClocks <= maxClocks) {
			//Exit out of HALT normally:
			this.CPUTicks = Math.max(currentClocks, this.CPUTicks);
			this.updateCoreFull();
			this.halt = false;
			this.CPUTicks = 0;
		}
		else {
			//Still in HALT, clock only up to the clocks specified per iteration:
			this.CPUTicks = Math.max(maxClocks, this.CPUTicks);
			this.remainingClocks = currentClocks - this.CPUTicks;
		}
	}
	else {
		//Still in HALT, clock only up to the clocks specified per iteration:
		//Will stay in HALT forever (Stuck in HALT forever), but the APU and LCD are still clocked, so don't pause:
		this.CPUTicks += maxClocks;
	}
}
//Memory Reading:
GameBoyCore.prototype.memoryRead = function (address) {
	//Act as a wrapper for reading the returns from the compiled jumps to memory.
	return this.memoryReader[address](this, address);	//This seems to be faster than the usual if/else.
}
GameBoyCore.prototype.memoryHighRead = function (address) {
	//Act as a wrapper for reading the returns from the compiled jumps to memory.
	return this.memoryHighReader[address](this, address);	//This seems to be faster than the usual if/else.
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
		else if (index < 0x9800) {
			this.memoryReader[index] = (this.cGBC) ? this.VRAMDATAReadCGBCPU : this.VRAMDATAReadDMGCPU;
		}
		else if (index < 0xA000) {
			this.memoryReader[index] = (this.cGBC) ? this.VRAMCHRReadCGBCPU : this.VRAMCHRReadDMGCPU;
		}
		else if (index >= 0xA000 && index < 0xC000) {
			if ((this.numRAMBanks == 1 / 16 && index < 0xA200) || this.numRAMBanks >= 1) {
				if (this.cMBC7) {
					this.memoryReader[index] = this.memoryReadMBC7;
				}
				else if (!this.cMBC3) {
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
					//JOYPAD:
					this.memoryHighReader[0] = this.memoryReader[0xFF00] = function (parentObj, address) {
						return 0xC0 | parentObj.memory[0xFF00];	//Top nibble returns as set.
					}
					break;
				case 0xFF01:
					//SB
					this.memoryHighReader[0x01] = this.memoryReader[0xFF01] = function (parentObj, address) {
						return (parentObj.memory[0xFF02] < 0x80) ? parentObj.memory[0xFF01] : 0xFF;
					}
					break;
				case 0xFF02:
					//SC
					if (this.cGBC) {
						this.memoryHighReader[0x02] = this.memoryReader[0xFF02] = function (parentObj, address) {
							return ((parentObj.serialTimer <= 0) ? 0x7C : 0xFC) | parentObj.memory[0xFF02];
						}
					}
					else {
						this.memoryHighReader[0x02] = this.memoryReader[0xFF02] = function (parentObj, address) {
							return ((parentObj.serialTimer <= 0) ? 0x7E : 0xFE) | parentObj.memory[0xFF02];
						}
					}
					break;
				case 0xFF04:
					//DIV
					this.memoryHighReader[0x04] = this.memoryReader[0xFF04] = function (parentObj, address) {
						parentObj.memory[0xFF04] = (parentObj.memory[0xFF04] + (parentObj.DIVTicks >> 8)) & 0xFF;
						parentObj.DIVTicks &= 0xFF;
						return parentObj.memory[0xFF04];
						
					}
					break;
				case 0xFF07:
					this.memoryHighReader[0x07] = this.memoryReader[0xFF07] = function (parentObj, address) {
						return 0xF8 | parentObj.memory[0xFF07];
					}
					break;
				case 0xFF0F:
					//IF
					this.memoryHighReader[0x0F] = this.memoryReader[0xFF0F] = function (parentObj, address) {
						return 0xE0 | parentObj.interruptsRequested;
					}
					break;
				case 0xFF10:
					this.memoryHighReader[0x10] = this.memoryReader[0xFF10] = function (parentObj, address) {
						return 0x80 | parentObj.memory[0xFF10];
					}
					break;
				case 0xFF11:
					this.memoryHighReader[0x11] = this.memoryReader[0xFF11] = function (parentObj, address) {
						return 0x3F | parentObj.memory[0xFF11];
					}
					break;
				case 0xFF13:
					this.memoryHighReader[0x13] = this.memoryReader[0xFF13] = this.memoryReadBAD;
					break;
				case 0xFF14:
					this.memoryHighReader[0x14] = this.memoryReader[0xFF14] = function (parentObj, address) {
						return 0xBF | parentObj.memory[0xFF14];
					}
					break;
				case 0xFF16:
					this.memoryHighReader[0x16] = this.memoryReader[0xFF16] = function (parentObj, address) {
						return 0x3F | parentObj.memory[0xFF16];
					}
					break;
				case 0xFF18:
					this.memoryHighReader[0x18] = this.memoryReader[0xFF18] = this.memoryReadBAD;
					break;
				case 0xFF19:
					this.memoryHighReader[0x19] = this.memoryReader[0xFF19] = function (parentObj, address) {
						return 0xBF | parentObj.memory[0xFF19];
					}
					break;
				case 0xFF1A:
					this.memoryHighReader[0x1A] = this.memoryReader[0xFF1A] = function (parentObj, address) {
						return 0x7F | parentObj.memory[0xFF1A];
					}
					break;
				case 0xFF1B:
					this.memoryHighReader[0x1B] = this.memoryReader[0xFF1B] = this.memoryReadBAD;
					break;
				case 0xFF1C:
					this.memoryHighReader[0x1C] = this.memoryReader[0xFF1C] = function (parentObj, address) {
						return 0x9F | parentObj.memory[0xFF1C];
					}
					break;
				case 0xFF1D:
					this.memoryHighReader[0x1D] = this.memoryReader[0xFF1D] = function (parentObj, address) {
						return 0xFF;
					}
					break;
				case 0xFF1E:
					this.memoryHighReader[0x1E] = this.memoryReader[0xFF1E] = function (parentObj, address) {
						return 0xBF | parentObj.memory[0xFF1E];
					}
					break;
				case 0xFF1F:
				case 0xFF20:
					this.memoryHighReader[index & 0xFF] = this.memoryReader[index] = this.memoryReadBAD;
					break;
				case 0xFF23:
					this.memoryHighReader[0x23] = this.memoryReader[0xFF23] = function (parentObj, address) {
						return 0xBF | parentObj.memory[0xFF23];
					}
					break;
				case 0xFF26:
					this.memoryHighReader[0x26] = this.memoryReader[0xFF26] = function (parentObj, address) {
						parentObj.audioJIT();
						return 0x70 | parentObj.memory[0xFF26];
					}
					break;
				case 0xFF27:
				case 0xFF28:
				case 0xFF29:
				case 0xFF2A:
				case 0xFF2B:
				case 0xFF2C:
				case 0xFF2D:
				case 0xFF2E:
				case 0xFF2F:
					this.memoryHighReader[index & 0xFF] = this.memoryReader[index] = this.memoryReadBAD;
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
						return (parentObj.channel3canPlay) ? parentObj.memory[0xFF00 | (parentObj.channel3Tracker >> 1)] : parentObj.memory[address];
					}
					this.memoryHighReader[index & 0xFF] = function (parentObj, address) {
						return (parentObj.channel3canPlay) ? parentObj.memory[0xFF00 | (parentObj.channel3Tracker >> 1)] : parentObj.memory[0xFF00 | address];
					}
					break;
				case 0xFF41:
					this.memoryHighReader[0x41] = this.memoryReader[0xFF41] = function (parentObj, address) {
						return 0x80 | parentObj.memory[0xFF41] | parentObj.modeSTAT;
					}
					break;
				case 0xFF44:
					this.memoryHighReader[0x44] = this.memoryReader[0xFF44] = function (parentObj, address) {
						return ((parentObj.LCDisOn) ? parentObj.memory[0xFF44] : 0);
					}
					break;
				case 0xFF4A:
					//WY
					this.memoryHighReader[0x4A] = this.memoryReader[0xFF4A] = function (parentObj, address) {
						return parentObj.windowY;
					}
					break;
				case 0xFF4F:
					this.memoryHighReader[0x4F] = this.memoryReader[0xFF4F] = function (parentObj, address) {
						return parentObj.currVRAMBank;
					}
					break;
				case 0xFF55:
					if (this.cGBC) {
						this.memoryHighReader[0x55] = this.memoryReader[0xFF55] = function (parentObj, address) {
							if (!parentObj.LCDisOn && parentObj.hdmaRunning) {	//Undocumented behavior alert: HDMA becomes GDMA when LCD is off (Worms Armageddon Fix).
								//DMA
								parentObj.DMAWrite((parentObj.memory[0xFF55] & 0x7F) + 1);
								parentObj.memory[0xFF55] = 0xFF;	//Transfer completed.
								parentObj.hdmaRunning = false;
							}
							return parentObj.memory[0xFF55];
						}
					}
					else {
						this.memoryReader[0xFF55] = this.memoryReadNormal;
						this.memoryHighReader[0x55] = this.memoryHighReadNormal;
					}
					break;
				case 0xFF56:
					if (this.cGBC) {
						this.memoryHighReader[0x56] = this.memoryReader[0xFF56] = function (parentObj, address) {
							//Return IR "not connected" status:
							return 0x3C | ((parentObj.memory[0xFF56] >= 0xC0) ? (0x2 | (parentObj.memory[0xFF56] & 0xC1)) : (parentObj.memory[0xFF56] & 0xC3));
						}
					}
					else {
						this.memoryReader[0xFF56] = this.memoryReadNormal;
						this.memoryHighReader[0x56] = this.memoryHighReadNormal;
					}
					break;
				case 0xFF6C:
					if (this.cGBC) {
						this.memoryHighReader[0x6C] = this.memoryReader[0xFF6C] = function (parentObj, address) {
							return 0xFE | parentObj.memory[0xFF6C];
						}
					}
					else {
						this.memoryHighReader[0x6C] = this.memoryReader[0xFF6C] = this.memoryReadBAD;
					}
					break;
				case 0xFF70:
					if (this.cGBC) {
						//SVBK
						this.memoryHighReader[0x70] = this.memoryReader[0xFF70] = function (parentObj, address) {
							return 0x40 | parentObj.memory[0xFF70];
						}
					}
					else {
						this.memoryHighReader[0x70] = this.memoryReader[0xFF70] = this.memoryReadBAD;
					}
					break;
				case 0xFF75:
					this.memoryHighReader[0x75] = this.memoryReader[0xFF75] = function (parentObj, address) {
						return 0x8F | parentObj.memory[0xFF75];
					}
					break;
				case 0xFF76:
				case 0xFF77:
					this.memoryHighReader[index & 0xFF] = this.memoryReader[index] = function (parentObj, address) {
						return 0;
					}
					break;
				case 0xFFFF:
					//IE
					this.memoryHighReader[0xFF] = this.memoryReader[0xFFFF] = function (parentObj, address) {
						return parentObj.interruptsEnabled;
					}
					break;
				default:
					this.memoryReader[index] = this.memoryReadNormal;
					this.memoryHighReader[index & 0xFF] = this.memoryHighReadNormal;
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
GameBoyCore.prototype.memoryHighReadNormal = function (parentObj, address) {
	return parentObj.memory[0xFF00 | address];
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
GameBoyCore.prototype.memoryReadMBC7 = function (parentObj, address) {
	//Switchable RAM
	if (parentObj.MBCRAMBanksEnabled || settings[10]) {
		switch (address) {
			case 0xA000:
			case 0xA060:
			case 0xA070:
				return 0;
			case 0xA080:
				//TODO: Gyro Control Register
				return 0;
			case 0xA050:
				//Y High Byte
				return parentObj.highY;
			case 0xA040:
				//Y Low Byte
				return parentObj.lowY;
			case 0xA030:
				//X High Byte
				return parentObj.highX;
			case 0xA020:
				//X Low Byte:
				return parentObj.lowX;
			default:
				return parentObj.MBCRam[address + parentObj.currMBCRAMBankPosition];
		}
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
GameBoyCore.prototype.VRAMDATAReadCGBCPU = function (parentObj, address) {
	//CPU Side Reading The VRAM (Optimized for GameBoy Color)
	return (parentObj.modeSTAT > 2) ? 0xFF : ((parentObj.currVRAMBank == 0) ? parentObj.memory[address] : parentObj.VRAM[address & 0x1FFF]);
}
GameBoyCore.prototype.VRAMDATAReadDMGCPU = function (parentObj, address) {
	//CPU Side Reading The VRAM (Optimized for classic GameBoy)
	return (parentObj.modeSTAT > 2) ? 0xFF : parentObj.memory[address];
}
GameBoyCore.prototype.VRAMCHRReadCGBCPU = function (parentObj, address) {
	//CPU Side Reading the Character Data Map:
	return (parentObj.modeSTAT > 2) ? 0xFF : parentObj.BGCHRCurrentBank[address & 0x7FF];
}
GameBoyCore.prototype.VRAMCHRReadDMGCPU = function (parentObj, address) {
	//CPU Side Reading the Character Data Map:
	return (parentObj.modeSTAT > 2) ? 0xFF : parentObj.BGCHRBank1[address & 0x7FF];
}
GameBoyCore.prototype.setCurrentMBC1ROMBank = function () {
	//Read the cartridge ROM data from RAM memory:
	switch (this.ROMBank1offs) {
		case 0x00:
		case 0x20:
		case 0x40:
		case 0x60:
			//Bank calls for 0x00, 0x20, 0x40, and 0x60 are really for 0x01, 0x21, 0x41, and 0x61.
			this.currentROMBank = this.ROMBank1offs << 14;
			break;
		default:
			this.currentROMBank = (this.ROMBank1offs - 1) << 14;
	}
	if (this.currentROMBank + 0x4000 >= this.ROM.length) {
		this.currentROMBank = ((this.currentROMBank + 0x4000) % this.ROM.length) - 0x4000;
	}
}
GameBoyCore.prototype.setCurrentMBC2AND3ROMBank = function () {
	//Read the cartridge ROM data from RAM memory:
	//Only map bank 0 to bank 1 here (MBC2 is like MBC1, but can only do 16 banks, so only the bank 0 quirk appears for MBC2):
	this.currentROMBank = Math.max(this.ROMBank1offs - 1, 0) << 14;
	if (this.currentROMBank + 0x4000 >= this.ROM.length) {
		this.currentROMBank = ((this.currentROMBank + 0x4000) % this.ROM.length) - 0x4000;
	}
}
GameBoyCore.prototype.setCurrentMBC5ROMBank = function () {
	//Read the cartridge ROM data from RAM memory:
	this.currentROMBank = (this.ROMBank1offs - 1) << 14;
	if (this.currentROMBank + 0x4000 >= this.ROM.length) {
		this.currentROMBank = ((this.currentROMBank + 0x4000) % this.ROM.length) - 0x4000;
	}
}
//Memory Writing:
GameBoyCore.prototype.memoryWrite = function (address, data) {
	//Act as a wrapper for writing by compiled jumps to specific memory writing functions.
	this.memoryWriter[address](this, address, data);
}
//0xFFXX fast path:
GameBoyCore.prototype.memoryHighWrite = function (address, data) {
	//Act as a wrapper for writing by compiled jumps to specific memory writing functions.
	this.memoryHighWriter[address](this, address, data);
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
			else if (this.cMBC5 || this.cRUMBLE || this.cMBC7) {
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
		else if (index < 0x9000) {
			this.memoryWriter[index] = (this.cGBC) ? this.VRAMGBCDATAWrite : this.VRAMGBDATAWrite;
		}
		else if (index < 0x9800) {
			this.memoryWriter[index] = (this.cGBC) ? this.VRAMGBCDATAWrite : this.VRAMGBDATAUpperWrite;
		}
		else if (index < 0xA000) {
			this.memoryWriter[index] = (this.cGBC) ? this.VRAMGBCCHRMAPWrite : this.VRAMGBCHRMAPWrite;
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
			this.memoryWriter[index] = (this.cGBC || (index & 3) != 0x1) ? this.memoryWriteGBCOAMRAM : this.memoryWriteGBOAMRAM;
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
			this.memoryHighWriter[index & 0xFF] = this.memoryHighWriteNormal;
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
		parentObj.currMBCRAMBank = data & 0x03;
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
	parentObj.currMBCRAMBank = data & 0x03;
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
GameBoyCore.prototype.memoryHighWriteNormal = function (parentObj, address, data) {
	parentObj.memory[0xFF00 | address] = data;
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
				parentObj.RTCDayOverFlow = (data > 0x7F);
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
GameBoyCore.prototype.memoryWriteGBOAMRAM = function (parentObj, address, data) {
	if (parentObj.modeSTAT < 2) {		//OAM RAM cannot be written to in mode 2 & 3
		var oldData = parentObj.memory[address];
		if (oldData != data) {
			parentObj.memory[address--] = data;
			if (oldData > 0 && oldData < 168) {
				//Remove the old position:
				var length = parentObj.OAMAddresses[oldData].length;
				while (length > 0) {
					if (parentObj.OAMAddresses[oldData][--length] == address) {
						parentObj.OAMAddresses[oldData].splice(length, 1);
						break;
					}
				}
			}
			if (data > 0 && data < 168) {
				//Make sure the stacking is correct if multiple sprites are at the same x-coord:
				var length = parentObj.OAMAddresses[data].length;
				while (length > 0) {
					if (parentObj.OAMAddresses[data][--length] > address) {
						parentObj.OAMAddresses[data].splice(length, 0, address);
						return;
					}
				}
				parentObj.OAMAddresses[data].push(address);
			}
		}
	}
}
GameBoyCore.prototype.memoryWriteGBOAMRAMUnsafe = function (parentObj, address, data) {
	parentObj.memory[address--] = data;
	if (data > 0 && data < 168) {
		//Make sure the stacking is correct if multiple sprites are at the same x-coord:
		var length = parentObj.OAMAddresses[data].length;
		while (length > 0) {
			if (parentObj.OAMAddresses[data][--length] > address) {
				parentObj.OAMAddresses[data].splice(length, 0, address);
				return;
			}
		}
		parentObj.OAMAddresses[data].push(address);
	}
}
GameBoyCore.prototype.memoryWriteGBCOAMRAM = function (parentObj, address, data) {
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
GameBoyCore.prototype.VRAMGBDATAWrite = function (parentObj, address, data) {
	if (parentObj.modeSTAT < 3) {	//VRAM cannot be written to during mode 3
		if (parentObj.memory[address] != data) {
			parentObj.memory[address] = data;
			data = (address & 0x1FF0) >> 4;
			parentObj.tileCacheValid[data] = parentObj.tileCacheValid[0x200 | data] = parentObj.tileCacheValid[0x400 | data] = parentObj.tileCacheValid[0x600 | data] = 0;
		}
	}
}
GameBoyCore.prototype.VRAMGBDATAUpperWrite = function (parentObj, address, data) {
	if (parentObj.modeSTAT < 3) {	//VRAM cannot be written to during mode 3
		if (parentObj.memory[address] != data) {
			parentObj.memory[address] = data;
			//Invalidate only one tile, since the OAM Attribute table cannot specify > 0xFF:
			parentObj.tileCacheValid[(address & 0x1FF0) >> 4] = 0;
		}
	}
}
GameBoyCore.prototype.VRAMGBCDATAWrite = function (parentObj, address, data) {
	if (parentObj.modeSTAT < 3) {	//VRAM cannot be written to during mode 3
		if (parentObj.currVRAMBank == 0) {
			if (parentObj.memory[address] != data) {
				parentObj.memory[address] = data;
				data = (address & 0x1FF0) >> 4;
				parentObj.tileCacheValid[data] = parentObj.tileCacheValid[0x400 | data] = parentObj.tileCacheValid[0x800 | data] = parentObj.tileCacheValid[0xC00 | data] = 0;
			}
		}
		else {
			if (parentObj.VRAM[address & 0x1FFF] != data) {
				parentObj.VRAM[address & 0x1FFF] = data;
				data = (address & 0x1FF0) >> 4;
				parentObj.tileCacheValid[0x200 | data] = parentObj.tileCacheValid[0x600 | data] = parentObj.tileCacheValid[0xA00 | data] = parentObj.tileCacheValid[0xE00 | data] = 0;
			}
		}
	}
}
GameBoyCore.prototype.VRAMGBCHRMAPWrite = function (parentObj, address, data) {
	if (parentObj.modeSTAT < 3) {	//VRAM cannot be written to during mode 3
		parentObj.BGCHRBank1[address & 0x7FF] = data;
	}
}
GameBoyCore.prototype.VRAMGBCCHRMAPWrite = function (parentObj, address, data) {
	if (parentObj.modeSTAT < 3) {	//VRAM cannot be written to during mode 3
		parentObj.BGCHRCurrentBank[address & 0x7FF] = data;
	}
}
GameBoyCore.prototype.DMAWrite = function (tilesToTransfer) {
	if (!this.halt) {
		//Clock the CPU for the DMA transfer (CPU is halted during the transfer):
		this.CPUTicks += 4 | ((tilesToTransfer << 5) << this.doubleSpeedShifter);
	}
	//Source address of the transfer:
	var source = (this.memory[0xFF51] << 8) | this.memory[0xFF52];
	//Destination address in the VRAM memory range:
	var destination = (this.memory[0xFF53] << 8) | this.memory[0xFF54];
	//Initialization:
	var tileTarget = 0;
	//Creating some references:
	var tileCacheValid = this.tileCacheValid;
	var memoryReader = this.memoryReader;
	var memory = this.memory;
	//Determining which bank we're working on so we can optimize:
	if (this.currVRAMBank == 0) {
		//DMA transfer for VRAM bank 0:
		do {
			if (destination < 0x1800) {
				tileTarget = destination >> 4;
				tileCacheValid[tileTarget] = tileCacheValid[0x400 | tileTarget] = tileCacheValid[0x800 | tileTarget] = tileCacheValid[0xC00 | tileTarget] = 0;
				memory[0x8000 | destination] = memoryReader[source](this, source++);
				memory[0x8001 | destination] = memoryReader[source](this, source++);
				memory[0x8002 | destination] = memoryReader[source](this, source++);
				memory[0x8003 | destination] = memoryReader[source](this, source++);
				memory[0x8004 | destination] = memoryReader[source](this, source++);
				memory[0x8005 | destination] = memoryReader[source](this, source++);
				memory[0x8006 | destination] = memoryReader[source](this, source++);
				memory[0x8007 | destination] = memoryReader[source](this, source++);
				memory[0x8008 | destination] = memoryReader[source](this, source++);
				memory[0x8009 | destination] = memoryReader[source](this, source++);
				memory[0x800A | destination] = memoryReader[source](this, source++);
				memory[0x800B | destination] = memoryReader[source](this, source++);
				memory[0x800C | destination] = memoryReader[source](this, source++);
				memory[0x800D | destination] = memoryReader[source](this, source++);
				memory[0x800E | destination] = memoryReader[source](this, source++);
				memory[0x800F | destination] = memoryReader[source](this, source++);
				destination += 0x10;
			}
			else {
				destination &= 0x7F0;
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank1[destination++] = memoryReader[source](this, source++);
				destination = (destination + 0x1800) & 0x1FF0;
			}
			source &= 0xFFF0;
			--tilesToTransfer;
		} while (tilesToTransfer > 0);
	}
	else {
		var VRAM = this.VRAM;
		//DMA transfer for VRAM bank 1:
		do {
			if (destination < 0x1800) {
				tileTarget = destination >> 4;
				tileCacheValid[0x200 | tileTarget] = tileCacheValid[0x600 | tileTarget] = tileCacheValid[0xA00 | tileTarget] = tileCacheValid[0xE00 | tileTarget] = 0;
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
				VRAM[destination++] = memoryReader[source](this, source++);
			}
			else {
				destination &= 0x7F0;
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				this.BGCHRBank2[destination++] = memoryReader[source](this, source++);
				destination = (destination + 0x1800) & 0x1FF0;
			}
			source &= 0xFFF0;
			--tilesToTransfer;
		} while (tilesToTransfer > 0);
	}
	//Update the HDMA registers to their next addresses:
	memory[0xFF51] = source >> 8;
	memory[0xFF52] = source & 0xF0;
	memory[0xFF53] = destination >> 8;
	memory[0xFF54] = destination & 0xF0;
}
GameBoyCore.prototype.registerWriteJumpCompile = function () {
	//I/O Registers (GB + GBC):
	//JoyPad
	this.memoryHighWriter[0] = this.memoryWriter[0xFF00] = function (parentObj, address, data) {
		parentObj.memory[0xFF00] = (data & 0x30) | ((((data & 0x20) == 0) ? (parentObj.JoyPad >> 4) : 0xF) & (((data & 0x10) == 0) ? (parentObj.JoyPad & 0xF) : 0xF));
	}
	//SB (Serial Transfer Data)
	this.memoryHighWriter[0x1] = this.memoryWriter[0xFF01] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF02] < 0x80) {	//Cannot write while a serial transfer is active.
			parentObj.memory[0xFF01] = data;
		}
	}
	//DIV
	this.memoryHighWriter[0x4] = this.memoryWriter[0xFF04] = function (parentObj, address, data) {
		parentObj.DIVTicks &= 0xFF;	//Update DIV for realignment.
		parentObj.memory[0xFF04] = 0;
	}
	//TIMA
	this.memoryHighWriter[0x5] = this.memoryWriter[0xFF05] = function (parentObj, address, data) {
		parentObj.memory[0xFF05] = data;
	}
	//TMA
	this.memoryHighWriter[0x6] = this.memoryWriter[0xFF06] = function (parentObj, address, data) {
		parentObj.memory[0xFF06] = data;
	}
	//TAC
	this.memoryHighWriter[0x7] = this.memoryWriter[0xFF07] = function (parentObj, address, data) {
		parentObj.memory[0xFF07] = data & 0x07;
		parentObj.TIMAEnabled = (data & 0x04) == 0x04;
		parentObj.TACClocker = Math.pow(4, ((data & 0x3) != 0) ? (data & 0x3) : 4) << 2;	//TODO: Find a way to not make a conditional in here...
	}
	//IF (Interrupt Request)
	this.memoryHighWriter[0xF] = this.memoryWriter[0xFF0F] = function (parentObj, address, data) {
		parentObj.interruptsRequested = data;
		parentObj.checkIRQMatching();
	}
	this.memoryHighWriter[0x10] = this.memoryWriter[0xFF10] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			if (parentObj.channel1decreaseSweep && (data & 0x08) == 0) {
				if (parentObj.channel1numSweep != parentObj.channel1frequencySweepDivider) {
					parentObj.channel1Fault |= 0x2;
				}
			}
			parentObj.channel1lastTimeSweep = parentObj.channel1timeSweep = (((data & 0x70) >> 4) * parentObj.channel1TimeSweepPreMultiplier) | 0;
			parentObj.channel1frequencySweepDivider = parentObj.channel1numSweep = data & 0x07;
			parentObj.channel1decreaseSweep = ((data & 0x08) == 0x08);
			//GB manual says that the audio won't play if this condition happens:
			if (parentObj.channel1numSweep == 0 && parentObj.channel1lastTimeSweep > 0 && parentObj.channel1decreaseSweep) {
				parentObj.channel1Fault |= 0x1;
			}
			else {
				parentObj.channel1Fault &= 0x1;
			}
			parentObj.memory[0xFF10] = data;
		}
	}
	this.memoryHighWriter[0x11] = this.memoryWriter[0xFF11] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled || !parentObj.cGBC) {
			if (parentObj.soundMasterEnabled) {
				parentObj.audioJIT();
			}
			else {
				data &= 0x3F;
			}
			parentObj.channel1adjustedDuty = parentObj.dutyLookup[data >> 6];
			parentObj.channel1totalLength = (0x40 - (data & 0x3F)) * parentObj.audioTotalLengthMultiplier;
			parentObj.memory[0xFF11] = data & 0xC0;
		}
	}
	this.memoryHighWriter[0x12] = this.memoryWriter[0xFF12] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			if (data < 0x08) {
				//Manual says this is a way to turn off the audio:
				parentObj.channel1currentVolume = parentObj.channel1envelopeVolume = 0;
			}
			else if ((parentObj.channel1consecutive || parentObj.channel1totalLength > 0) && parentObj.channel1envelopeSweeps == 0) {
				//Zombie Volume PAPU Bug:
				if (((parentObj.memory[0xFF12] ^ data) & 0x8) == 0x8) {
					if ((parentObj.memory[0xFF12] & 0x8) == 0) {
						if ((parentObj.memory[0xFF12] & 0x7) == 0x7) {
							parentObj.channel1envelopeVolume += 2;
						}
						else {
							++parentObj.channel1envelopeVolume;
						}
					}
					parentObj.channel1envelopeVolume = (16 - parentObj.channel1envelopeVolume) & 0xF;
				}
				else if ((parentObj.memory[0xFF12] & 0xF) == 0x8) {
					parentObj.channel1envelopeVolume = (1 + parentObj.channel1envelopeVolume) & 0xF;
				}
				parentObj.channel1currentVolume = parentObj.channel1envelopeVolume / 0x1E;
			}
			parentObj.channel1envelopeType = ((data & 0x08) == 0x08);
			parentObj.memory[0xFF12] = data;
		}
	}
	this.memoryHighWriter[0x13] = this.memoryWriter[0xFF13] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			parentObj.channel1frequency = (parentObj.channel1frequency & 0x700) | data;
			//Pre-calculate the frequency computation outside the waveform generator for speed:
			parentObj.channel1adjustedFrequencyPrep = parentObj.preChewedAudioComputationMultiplier / (0x800 - parentObj.channel1frequency);
			parentObj.memory[0xFF13] = data;
		}
	}
	this.memoryHighWriter[0x14] = this.memoryWriter[0xFF14] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			parentObj.channel1consecutive = ((data & 0x40) == 0x0);
			parentObj.channel1frequency = ((data & 0x7) << 8) | (parentObj.channel1frequency & 0xFF);
			if (data > 0x7F) {
				//Reload 0xFF10:
				parentObj.channel1timeSweep = parentObj.channel1lastTimeSweep;
				parentObj.channel1numSweep = parentObj.channel1frequencySweepDivider;
				//Reload 0xFF12:
				var nr12 = parentObj.memory[0xFF12];
				if (nr12 > 0x07) {
					parentObj.channel1envelopeVolume = nr12 >> 4;
					parentObj.channel1currentVolume = parentObj.channel1envelopeVolume / 0x1E;
					parentObj.channel1envelopeSweeps = nr12 & 0x7;
					parentObj.channel1volumeEnvTime = parentObj.channel1volumeEnvTimeLast = parentObj.channel1envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
					if (parentObj.channel1totalLength <= 0) {
						parentObj.channel1totalLength = 0x40 * parentObj.audioTotalLengthMultiplier;
					}
				}
				if ((data & 0x40) == 0x40) {
					parentObj.memory[0xFF26] |= 0x1;
				}
				parentObj.channel1ShadowFrequency = parentObj.channel1frequency;
				//Reset frequency overflow check + frequency sweep type check:
				parentObj.channel1Fault &= 0x2;
			}
			if (parentObj.channel1numSweep == 0 && parentObj.channel1lastTimeSweep > 0 && parentObj.channel1decreaseSweep) {
				parentObj.channel1Fault |= 0x1;
			}
			else {
				parentObj.channel1Fault &= 0x1;
			}
			//Pre-calculate the frequency computation outside the waveform generator for speed:
			parentObj.channel1adjustedFrequencyPrep = parentObj.preChewedAudioComputationMultiplier / (0x800 - parentObj.channel1frequency);
			parentObj.memory[0xFF14] = data & 0x40;
		}
	}
	this.memoryHighWriter[0x16] = this.memoryWriter[0xFF16] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled || !parentObj.cGBC) {
			if (parentObj.soundMasterEnabled) {
				parentObj.audioJIT();
			}
			else {
				data &= 0x3F;
			}
			parentObj.channel2adjustedDuty = parentObj.dutyLookup[data >> 6];
			parentObj.channel2totalLength = (0x40 - (data & 0x3F)) * parentObj.audioTotalLengthMultiplier;
			parentObj.memory[0xFF16] = data & 0xC0;
		}
	}
	this.memoryHighWriter[0x17] = this.memoryWriter[0xFF17] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			if (data < 0x08) {
				//Manual says this is a way to turn off the audio:
				parentObj.channel2currentVolume = parentObj.channel2envelopeVolume = 0;
			}
			else if ((parentObj.channel2consecutive || parentObj.channel2totalLength > 0) && parentObj.channel2envelopeSweeps == 0) {
				//Zombie Volume PAPU Bug:
				if (((parentObj.memory[0xFF17] ^ data) & 0x8) == 0x8) {
					if ((parentObj.memory[0xFF17] & 0x8) == 0) {
						if ((parentObj.memory[0xFF17] & 0x7) == 0x7) {
							parentObj.channel2envelopeVolume += 2;
						}
						else {
							++parentObj.channel2envelopeVolume;
						}
					}
					parentObj.channel2envelopeVolume = (16 - parentObj.channel2envelopeVolume) & 0xF;
				}
				else if ((parentObj.memory[0xFF17] & 0xF) == 0x8) {
					parentObj.channel2envelopeVolume = (1 + parentObj.channel2envelopeVolume) & 0xF;
				}
				parentObj.channel2currentVolume = parentObj.channel2envelopeVolume / 0x1E;
			}
			parentObj.channel2envelopeType = ((data & 0x08) == 0x08);
			parentObj.memory[0xFF17] = data;
		}
	}
	this.memoryHighWriter[0x18] = this.memoryWriter[0xFF18] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			parentObj.channel2frequency = (parentObj.channel2frequency & 0x700) | data;
			//Pre-calculate the frequency computation outside the waveform generator for speed:
			parentObj.channel2adjustedFrequencyPrep = parentObj.preChewedAudioComputationMultiplier / (0x800 - parentObj.channel2frequency);
			parentObj.memory[0xFF18] = data;
		}
	}
	this.memoryHighWriter[0x19] = this.memoryWriter[0xFF19] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			if (data > 0x7F) {
				//Reload 0xFF17:
				var nr22 = parentObj.memory[0xFF17];
				if (nr22 > 0x7) {
					parentObj.channel2envelopeVolume = nr22 >> 4;
					parentObj.channel2currentVolume = parentObj.channel2envelopeVolume / 0x1E;
					parentObj.channel2envelopeSweeps = nr22 & 0x7;
					parentObj.channel2volumeEnvTime = parentObj.channel2volumeEnvTimeLast = parentObj.channel2envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
					if (parentObj.channel2totalLength <= 0) {
						parentObj.channel2totalLength = 0x40 * parentObj.audioTotalLengthMultiplier;
					}
				}
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
	}
	this.memoryHighWriter[0x1A] = this.memoryWriter[0xFF1A] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			if (!parentObj.channel3canPlay && data >= 0x80) {
				parentObj.channel3Tracker = 0;
			}
			parentObj.channel3canPlay = (data > 0x7F);
			if (parentObj.channel3canPlay && parentObj.memory[0xFF1A] > 0x7F && !parentObj.channel3consecutive) {
				parentObj.memory[0xFF26] |= 0x4;
			}
			parentObj.memory[0xFF1A] = data & 0x80;
		}
	}
	this.memoryHighWriter[0x1B] = this.memoryWriter[0xFF1B] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled || !parentObj.cGBC) {
			if (parentObj.soundMasterEnabled) {
				parentObj.audioJIT();
			}
			parentObj.channel3totalLength = (0x100 - data) * parentObj.audioTotalLengthMultiplier;
			parentObj.memory[0xFF1B] = data;
		}
	}
	this.memoryHighWriter[0x1C] = this.memoryWriter[0xFF1C] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			parentObj.memory[0xFF1C] = data & 0x60;
			parentObj.channel3patternType = parentObj.memory[0xFF1C] - 0x20;
		}
	}
	this.memoryHighWriter[0x1D] = this.memoryWriter[0xFF1D] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			parentObj.channel3frequency = (parentObj.channel3frequency & 0x700) | data;
			parentObj.channel3adjustedFrequencyPrep = parentObj.preChewedWAVEAudioComputationMultiplier / (0x800 - parentObj.channel3frequency);
			parentObj.memory[0xFF1D] = data;
		}
	}
	this.memoryHighWriter[0x1E] = this.memoryWriter[0xFF1E] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			if (data > 0x7F) {
				if (parentObj.channel3totalLength <= 0) {
					parentObj.channel3totalLength = 0x100 * parentObj.audioTotalLengthMultiplier;
				}
				parentObj.channel3Tracker = 0;
				if ((data & 0x40) == 0x40) {
					parentObj.memory[0xFF26] |= 0x4;
				}
			}
			parentObj.channel3consecutive = ((data & 0x40) == 0x0);
			parentObj.channel3frequency = ((data & 0x7) << 8) | (parentObj.channel3frequency & 0xFF);
			parentObj.channel3adjustedFrequencyPrep = parentObj.preChewedWAVEAudioComputationMultiplier / (0x800 - parentObj.channel3frequency);
			parentObj.memory[0xFF1E] = data & 0x40;
		}
	}
	this.memoryHighWriter[0x20] = this.memoryWriter[0xFF20] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled || !parentObj.cGBC) {
			if (parentObj.soundMasterEnabled) {
				parentObj.audioJIT();
			}
			parentObj.channel4totalLength = (0x40 - (data & 0x3F)) * parentObj.audioTotalLengthMultiplier;
			parentObj.memory[0xFF20] = data | 0xC0;
		}
	}
	this.memoryHighWriter[0x21] = this.memoryWriter[0xFF21] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			if (data < 0x08) {
				//Manual says this is a way to turn off the audio:
				parentObj.channel4currentVolume = parentObj.channel4envelopeVolume = 0;
			}
			/*else if ((parentObj.channel4consecutive || parentObj.channel4totalLength > 0) && parentObj.channel4envelopeSweeps == 0) {
				//Zombie Volume PAPU Bug:
				if (((parentObj.memory[0xFF21] ^ data) & 0x8) == 0x8) {
					if ((parentObj.memory[0xFF21] & 0x8) == 0) {
						if ((parentObj.memory[0xFF21] & 0x7) == 0x7) {
							parentObj.channel4envelopeVolume += 2;
						}
						else {
							++parentObj.channel4envelopeVolume;
						}
					}
					parentObj.channel4envelopeVolume = (16 - parentObj.channel4envelopeVolume) & 0xF;
				}
				else if ((parentObj.memory[0xFF21] & 0xF) == 0x8) {
					parentObj.channel4envelopeVolume = (1 + parentObj.channel4envelopeVolume) & 0xF;
				}
				parentObj.channel4currentVolume = parentObj.channel4envelopeVolume << parentObj.channel4VolumeShifter;
			}*/
			parentObj.channel4envelopeType = ((data & 0x08) == 0x08);
			parentObj.memory[0xFF21] = data;
		}
	}
	this.memoryHighWriter[0x22] = this.memoryWriter[0xFF22] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			parentObj.channel4adjustedFrequencyPrep = (data < 0x80 && (data & 0xF0) != 0x70) ? (parentObj.whiteNoiseFrequencyPreMultiplier / Math.max(data & 0x7, 0.5) / Math.pow(2, (data >> 4) + 1)) : 0;
			var bitWidth = (data & 0x8);
			if ((bitWidth == 0x8 && parentObj.noiseTableLength == 0x8000) || (bitWidth == 0 && parentObj.noiseTableLength == 0x80)) {
				parentObj.channel4lastSampleLookup = 0;
				parentObj.noiseTableLength = (bitWidth == 0x8) ? 0x80 : 0x8000;
				parentObj.channel4VolumeShifter = (bitWidth == 0x8) ? 7 : 15;
				parentObj.channel4currentVolume = parentObj.channel4envelopeVolume << parentObj.channel4VolumeShifter;
				parentObj.noiseSampleTable = (bitWidth == 0x8) ? parentObj.LSFR7Table : parentObj.LSFR15Table;
			}
			parentObj.memory[0xFF22] = data;
		}
	}
	this.memoryHighWriter[0x23] = this.memoryWriter[0xFF23] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled) {
			parentObj.audioJIT();
			parentObj.memory[0xFF23] = data;
			parentObj.channel4consecutive = ((data & 0x40) == 0x0);
			if (data > 0x7F) {
				var nr42 = parentObj.memory[0xFF21];
				if (nr42 > 0x7) {
					parentObj.channel4envelopeVolume = nr42 >> 4;
					parentObj.channel4currentVolume = parentObj.channel4envelopeVolume << parentObj.channel4VolumeShifter;
					parentObj.channel4envelopeSweeps = nr42 & 0x7;
					parentObj.channel4volumeEnvTime = parentObj.channel4volumeEnvTimeLast = parentObj.channel4envelopeSweeps * parentObj.volumeEnvelopePreMultiplier;
					if (parentObj.channel4totalLength <= 0) {
						parentObj.channel4totalLength = 0x40 * parentObj.audioTotalLengthMultiplier;
					}
				}
				if ((data & 0x40) == 0x40) {
					parentObj.memory[0xFF26] |= 0x8;
				}
			}
		}
	}
	this.memoryHighWriter[0x24] = this.memoryWriter[0xFF24] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled && parentObj.memory[0xFF24] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF24] = data;
			parentObj.VinLeftChannelMasterVolume = (((data >> 4) & 0x07) + 1) / 8;
			parentObj.VinRightChannelMasterVolume = ((data & 0x07) + 1) / 8;
		}
	}
	this.memoryHighWriter[0x25] = this.memoryWriter[0xFF25] = function (parentObj, address, data) {
		if (parentObj.soundMasterEnabled && parentObj.memory[0xFF25] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF25] = data;
			parentObj.rightChannel0 = ((data & 0x01) == 0x01);
			parentObj.rightChannel1 = ((data & 0x02) == 0x02);
			parentObj.rightChannel2 = ((data & 0x04) == 0x04);
			parentObj.rightChannel3 = ((data & 0x08) == 0x08);
			parentObj.leftChannel0 = ((data & 0x10) == 0x10);
			parentObj.leftChannel1 = ((data & 0x20) == 0x20);
			parentObj.leftChannel2 = ((data & 0x40) == 0x40);
			parentObj.leftChannel3 = (data > 0x7F);
		}
	}
	this.memoryHighWriter[0x26] = this.memoryWriter[0xFF26] = function (parentObj, address, data) {
		parentObj.audioJIT();
		var soundEnabled = (data & 0x80);
		parentObj.memory[0xFF26] = soundEnabled | (parentObj.memory[0xFF26] & 0xF);
		if (!parentObj.soundMasterEnabled && (soundEnabled == 0x80)) {
			parentObj.memory[0xFF26] = 0;
			parentObj.soundMasterEnabled = true;
			parentObj.initializeAudioStartState();
		}
		else if (parentObj.soundMasterEnabled && (soundEnabled == 0)) {
			parentObj.memory[0xFF26] = 0;
			parentObj.soundMasterEnabled = false;
			//GBDev wiki says the registers are written with zeros on power off:
			for (var index = 0xFF10; index < 0xFF26; index++) {
				parentObj.memoryWriter[index](parentObj, index, 0);
			}
		}
	}
	//0xFF27 to 0xFF2F don't do anything...
	this.memoryHighWriter[0x27] = this.memoryWriter[0xFF27] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x28] = this.memoryWriter[0xFF28] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x29] = this.memoryWriter[0xFF29] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x2A] = this.memoryWriter[0xFF2A] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x2B] = this.memoryWriter[0xFF2B] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x2C] = this.memoryWriter[0xFF2C] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x2D] = this.memoryWriter[0xFF2D] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x2E] = this.memoryWriter[0xFF2E] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x2F] = this.memoryWriter[0xFF2F] = this.cartIgnoreWrite;
	//WAVE PCM RAM:
	this.memoryHighWriter[0x30] = this.memoryWriter[0xFF30] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF30] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF30] = data;
			parentObj.channel3PCM[0x00] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x20] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x40] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x01] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x21] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x41] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x31] = this.memoryWriter[0xFF31] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF31] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF31] = data;
			parentObj.channel3PCM[0x02] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x22] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x42] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x03] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x23] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x43] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x32] = this.memoryWriter[0xFF32] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF32] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF32] = data;
			parentObj.channel3PCM[0x04] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x24] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x44] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x05] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x25] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x45] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x33] = this.memoryWriter[0xFF33] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF33] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF33] = data;
			parentObj.channel3PCM[0x06] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x26] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x46] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x07] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x27] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x47] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x34] = this.memoryWriter[0xFF34] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF34] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF34] = data;
			parentObj.channel3PCM[0x08] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x28] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x48] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x09] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x29] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x49] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x35] = this.memoryWriter[0xFF35] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF35] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF35] = data;
			parentObj.channel3PCM[0x0A] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x2A] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x4A] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x0B] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x2B] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x4B] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x36] = this.memoryWriter[0xFF36] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF36] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF36] = data;
			parentObj.channel3PCM[0x0C] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x2C] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x4C] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x0D] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x2D] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x4D] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x37] = this.memoryWriter[0xFF37] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF37] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF37] = data;
			parentObj.channel3PCM[0x0E] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x2E] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x4E] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x0F] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x2F] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x4F] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x38] = this.memoryWriter[0xFF38] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF38] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF38] = data;
			parentObj.channel3PCM[0x10] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x30] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x50] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x11] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x31] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x51] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x39] = this.memoryWriter[0xFF39] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF39] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF39] = data;
			parentObj.channel3PCM[0x12] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x32] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x52] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x13] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x33] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x53] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x3A] = this.memoryWriter[0xFF3A] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF3A] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF3A] = data;
			parentObj.channel3PCM[0x14] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x34] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x54] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x15] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x35] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x55] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x3B] = this.memoryWriter[0xFF3B] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF3B] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF3B] = data;
			parentObj.channel3PCM[0x16] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x36] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x56] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x17] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x37] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x57] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x3C] = this.memoryWriter[0xFF3C] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF3C] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF3C] = data;
			parentObj.channel3PCM[0x18] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x38] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x58] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x19] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x39] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x59] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x3D] = this.memoryWriter[0xFF3D] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF3D] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF3D] = data;
			parentObj.channel3PCM[0x1A] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x3A] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x5A] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x1B] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x3B] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x5B] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x3E] = this.memoryWriter[0xFF3E] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF3E] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF3E] = data;
			parentObj.channel3PCM[0x1C] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x3C] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x5C] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x1D] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x3D] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x5D] = (data & 0xC) / 0x78;
		}
	}
	this.memoryHighWriter[0x3F] = this.memoryWriter[0xFF3F] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF3F] != data) {
			parentObj.audioJIT();
			parentObj.memory[0xFF3F] = data;
			parentObj.channel3PCM[0x1E] = (data >> 4) / 0x1E;
			parentObj.channel3PCM[0x3E] = (data >> 5) / 0x1E;
			parentObj.channel3PCM[0x5E] = (data >> 6) / 0x1E;
			parentObj.channel3PCM[0x1F] = (data & 0xF) / 0x1E;
			parentObj.channel3PCM[0x3F] = (data & 0xE) / 0x3C;
			parentObj.channel3PCM[0x5F] = (data & 0xC) / 0x78;
		}
	}
	//SCY
	this.memoryHighWriter[0x42] = this.memoryWriter[0xFF42] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF42] != data) {
			parentObj.renderMidScanLine();
			parentObj.memory[0xFF42] = data;
		}
	}
	//SCX
	this.memoryHighWriter[0x43] = this.memoryWriter[0xFF43] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF43] != data) {
			parentObj.renderMidScanLine();
			parentObj.memory[0xFF43] = data;
		}
	}
	//LY
	this.memoryHighWriter[0x44] = this.memoryWriter[0xFF44] = function (parentObj, address, data) {
		//Read Only:
		if (parentObj.LCDisOn) {
			//Gambatte says to do this:
			if (parentObj.drewBlank == 0 && (parentObj.actualScanLine > 0 || parentObj.STATTracker == 2)) {
				//Blit out the partial frame:
				parentObj.drawToCanvas();
			}
			parentObj.modeSTAT = 2;
			parentObj.LCDTicks = parentObj.STATTracker = parentObj.actualScanLine = parentObj.memory[0xFF44] = 0;
		}
	}
	//LYC
	this.memoryHighWriter[0x45] = this.memoryWriter[0xFF45] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF45] != data) {
			parentObj.memory[0xFF45] = data;
			if (parentObj.LCDisOn) {
				parentObj.matchLYC();	//Get the compare of the first scan line.
			}
		}
	}
	//WY
	this.memoryHighWriter[0x4A] = this.memoryWriter[0xFF4A] = function (parentObj, address, data) {
		if (parentObj.windowY != data) {
			parentObj.renderMidScanLine();
			parentObj.windowY = data;
		}
	}
	//WX
	this.memoryHighWriter[0x4B] = this.memoryWriter[0xFF4B] = function (parentObj, address, data) {
		if (parentObj.memory[0xFF4B] != data) {
			parentObj.renderMidScanLine();
			parentObj.memory[0xFF4B] = data;
			parentObj.windowX = data - 7;
		}
	}
	this.memoryHighWriter[0x72] = this.memoryWriter[0xFF72] = function (parentObj, address, data) {
		parentObj.memory[0xFF72] = data;
	}
	this.memoryHighWriter[0x73] = this.memoryWriter[0xFF73] = function (parentObj, address, data) {
		parentObj.memory[0xFF73] = data;
	}
	this.memoryHighWriter[0x75] = this.memoryWriter[0xFF75] = function (parentObj, address, data) {
		parentObj.memory[0xFF75] = data;
	}
	this.memoryHighWriter[0x76] = this.memoryWriter[0xFF76] = this.cartIgnoreWrite;
	this.memoryHighWriter[0x77] = this.memoryWriter[0xFF77] = this.cartIgnoreWrite;
	//IE (Interrupt Enable)
	this.memoryHighWriter[0xFF] = this.memoryWriter[0xFFFF] = function (parentObj, address, data) {
		parentObj.interruptsEnabled = data;
		parentObj.checkIRQMatching();
	}
	this.recompileModelSpecificIOWriteHandling();
	this.recompileBootIOWriteHandling();
}
GameBoyCore.prototype.recompileModelSpecificIOWriteHandling = function () {
	if (this.cGBC) {
		//GameBoy Color Specific I/O:
		//SC (Serial Transfer Control Register)
		this.memoryHighWriter[0x2] = this.memoryWriter[0xFF02] = function (parentObj, address, data) {
			if (((data & 0x1) == 0x1)) {
				//Internal clock:
				parentObj.memory[0xFF02] = (data & 0x7F);
				parentObj.serialTimer = ((data & 0x2) == 0) ? 4096 : 128;	//Set the Serial IRQ counter.
				parentObj.serialShiftTimer = parentObj.serialShiftTimerAllocated = ((data & 0x2) == 0) ? 512 : 16;	//Set the transfer data shift counter.
			}
			else {
				//External clock:
				parentObj.memory[0xFF02] = data;
				parentObj.serialShiftTimer = parentObj.serialShiftTimerAllocated = parentObj.serialTimer = 0;	//Zero the timers, since we're emulating as if nothing is connected.
			}
		}
		this.memoryHighWriter[0x40] = this.memoryWriter[0xFF40] = function (parentObj, address, data) {
			if (parentObj.memory[0xFF40] != data) {
				parentObj.renderMidScanLine();
			}
			var temp_var = (data > 0x7F);
			if (temp_var != parentObj.LCDisOn) {
				//When the display mode changes...
				parentObj.LCDisOn = temp_var;
				parentObj.memory[0xFF41] &= 0x78;
				parentObj.STATTracker = parentObj.LCDTicks = parentObj.actualScanLine = parentObj.memory[0xFF44] = 0;
				if (parentObj.LCDisOn) {
					parentObj.modeSTAT = 2;
					parentObj.matchLYC();	//Get the compare of the first scan line.
					parentObj.LCDCONTROL = parentObj.LINECONTROL;
				}
				else {
					parentObj.modeSTAT = 0;
					parentObj.LCDCONTROL = parentObj.DISPLAYOFFCONTROL;
					parentObj.DisplayShowOff();
				}
				parentObj.interruptsRequested &= 0xFD;
			}
			parentObj.gfxWindowCHRBankPosition = ((data & 0x40) == 0x40) ? 0x400 : 0;
			parentObj.gfxWindowDisplay = ((data & 0x20) == 0x20);
			parentObj.gfxBackgroundBankOffset = ((data & 0x10) == 0x10) ? 0 : 0x80;
			parentObj.gfxBackgroundCHRBankPosition = ((data & 0x08) == 0x08) ? 0x400 : 0;
			parentObj.gfxSpriteNormalHeight = ((data & 0x04) == 0);
			parentObj.gfxSpriteShow = ((data & 0x02) == 0x02);
			parentObj.BGPriorityEnabled = ((data & 0x01) == 0x01) ? 0x1000000 : 0;
			parentObj.memory[0xFF40] = data;
		}
		this.memoryHighWriter[0x41] = this.memoryWriter[0xFF41] = function (parentObj, address, data) {
			parentObj.LYCMatchTriggerSTAT = ((data & 0x40) == 0x40);
			parentObj.mode2TriggerSTAT = ((data & 0x20) == 0x20);
			parentObj.mode1TriggerSTAT = ((data & 0x10) == 0x10);
			parentObj.mode0TriggerSTAT = ((data & 0x08) == 0x08);
			parentObj.memory[0xFF41] = data & 0x78;
		}
		this.memoryHighWriter[0x46] = this.memoryWriter[0xFF46] = function (parentObj, address, data) {
			parentObj.memory[0xFF46] = data;
			if (data < 0xE0) {
				data <<= 8;
				address = 0xFE00;
				var stat = parentObj.modeSTAT;
				parentObj.modeSTAT = 0;
				do {
					parentObj.memory[address++] = parentObj.memoryReader[data](parentObj, data++);
				} while (address < 0xFEA0);
				parentObj.modeSTAT = stat;
			}
		}
		//KEY1
		this.memoryHighWriter[0x4D] = this.memoryWriter[0xFF4D] = function (parentObj, address, data) {
			parentObj.memory[0xFF4D] = (data & 0x7F) | (parentObj.memory[0xFF4D] & 0x80);
		}
		this.memoryHighWriter[0x4F] = this.memoryWriter[0xFF4F] = function (parentObj, address, data) {
			parentObj.currVRAMBank = data & 0x01;
			if (parentObj.currVRAMBank > 0) {
				parentObj.BGCHRCurrentBank = parentObj.BGCHRBank2;
			}
			else {
				parentObj.BGCHRCurrentBank = parentObj.BGCHRBank1;
			}
			//Only writable by GBC.
		}
		this.memoryHighWriter[0x51] = this.memoryWriter[0xFF51] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				parentObj.memory[0xFF51] = data;
			}
		}
		this.memoryHighWriter[0x52] = this.memoryWriter[0xFF52] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				parentObj.memory[0xFF52] = data & 0xF0;
			}
		}
		this.memoryHighWriter[0x53] = this.memoryWriter[0xFF53] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				parentObj.memory[0xFF53] = data & 0x1F;
			}
		}
		this.memoryHighWriter[0x54] = this.memoryWriter[0xFF54] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				parentObj.memory[0xFF54] = data & 0xF0;
			}
		}
		this.memoryHighWriter[0x55] = this.memoryWriter[0xFF55] = function (parentObj, address, data) {
			if (!parentObj.hdmaRunning) {
				if ((data & 0x80) == 0) {
					//DMA
					parentObj.DMAWrite((data & 0x7F) + 1);
					parentObj.memory[0xFF55] = 0xFF;	//Transfer completed.
				}
				else {
					//H-Blank DMA
					parentObj.hdmaRunning = true;
					parentObj.memory[0xFF55] = data & 0x7F;
				}
			}
			else if ((data & 0x80) == 0) {
				//Stop H-Blank DMA
				parentObj.hdmaRunning = false;
				parentObj.memory[0xFF55] |= 0x80;
			}
			else {
				parentObj.memory[0xFF55] = data & 0x7F;
			}
		}
		this.memoryHighWriter[0x68] = this.memoryWriter[0xFF68] = function (parentObj, address, data) {
			parentObj.memory[0xFF69] = parentObj.gbcBGRawPalette[data & 0x3F];
			parentObj.memory[0xFF68] = data;
		}
		this.memoryHighWriter[0x69] = this.memoryWriter[0xFF69] = function (parentObj, address, data) {
			parentObj.updateGBCBGPalette(parentObj.memory[0xFF68] & 0x3F, data);
			if (parentObj.memory[0xFF68] > 0x7F) { // high bit = autoincrement
				var next = ((parentObj.memory[0xFF68] + 1) & 0x3F);
				parentObj.memory[0xFF68] = (next | 0x80);
				parentObj.memory[0xFF69] = parentObj.gbcBGRawPalette[next];
			}
			else {
				parentObj.memory[0xFF69] = data;
			}
		}
		this.memoryHighWriter[0x6A] = this.memoryWriter[0xFF6A] = function (parentObj, address, data) {
			parentObj.memory[0xFF6B] = parentObj.gbcOBJRawPalette[data & 0x3F];
			parentObj.memory[0xFF6A] = data;
		}
		this.memoryHighWriter[0x6B] = this.memoryWriter[0xFF6B] = function (parentObj, address, data) {
			parentObj.updateGBCOBJPalette(parentObj.memory[0xFF6A] & 0x3F, data);
			if (parentObj.memory[0xFF6A] > 0x7F) { // high bit = autoincrement
				var next = ((parentObj.memory[0xFF6A] + 1) & 0x3F);
				parentObj.memory[0xFF6A] = (next | 0x80);
				parentObj.memory[0xFF6B] = parentObj.gbcOBJRawPalette[next];
			}
			else {
				parentObj.memory[0xFF6B] = data;
			}
		}
		//SVBK
		this.memoryHighWriter[0x70] = this.memoryWriter[0xFF70] = function (parentObj, address, data) {
			var addressCheck = (parentObj.memory[0xFF51] << 8) | parentObj.memory[0xFF52];	//Cannot change the RAM bank while WRAM is the source of a running HDMA.
			if (!parentObj.hdmaRunning || addressCheck < 0xD000 || addressCheck >= 0xE000) {
				parentObj.gbcRamBank = Math.max(data & 0x07, 1);	//Bank range is from 1-7
				parentObj.gbcRamBankPosition = ((parentObj.gbcRamBank - 1) << 12) - 0xD000;
				parentObj.gbcRamBankPositionECHO = parentObj.gbcRamBankPosition - 0x2000;
			}
			parentObj.memory[0xFF70] = data;	//Bit 6 cannot be written to.
		}
		this.memoryHighWriter[0x74] = this.memoryWriter[0xFF74] = function (parentObj, address, data) {
			parentObj.memory[0xFF74] = data;
		}
	}
	else {
		//Fill in the GameBoy Color I/O registers as normal RAM for GameBoy compatibility:
		//SC (Serial Transfer Control Register)
		this.memoryHighWriter[0x2] = this.memoryWriter[0xFF02] = function (parentObj, address, data) {
			if (((data & 0x1) == 0x1)) {
				//Internal clock:
				parentObj.memory[0xFF02] = (data & 0x7F);
				parentObj.serialTimer = 4096;	//Set the Serial IRQ counter.
				parentObj.serialShiftTimer = parentObj.serialShiftTimerAllocated = 512;	//Set the transfer data shift counter.
			}
			else {
				//External clock:
				parentObj.memory[0xFF02] = data;
				parentObj.serialShiftTimer = parentObj.serialShiftTimerAllocated = parentObj.serialTimer = 0;	//Zero the timers, since we're emulating as if nothing is connected.
			}
		}
		this.memoryHighWriter[0x40] = this.memoryWriter[0xFF40] = function (parentObj, address, data) {
			if (parentObj.memory[0xFF40] != data) {
				parentObj.renderMidScanLine();
			}
			var temp_var = (data > 0x7F);
			if (temp_var != parentObj.LCDisOn) {
				//When the display mode changes...
				parentObj.LCDisOn = temp_var;
				parentObj.memory[0xFF41] &= 0x78;
				parentObj.STATTracker = parentObj.LCDTicks = parentObj.actualScanLine = parentObj.memory[0xFF44] = 0;
				if (parentObj.LCDisOn) {
					parentObj.modeSTAT = 2;
					parentObj.matchLYC();	//Get the compare of the first scan line.
					parentObj.LCDCONTROL = parentObj.LINECONTROL;
				}
				else {
					parentObj.modeSTAT = 0;
					parentObj.LCDCONTROL = parentObj.DISPLAYOFFCONTROL;
					parentObj.DisplayShowOff();
				}
				parentObj.interruptsRequested &= 0xFD;
			}
			parentObj.gfxWindowCHRBankPosition = ((data & 0x40) == 0x40) ? 0x400 : 0;
			parentObj.gfxWindowDisplay = (data & 0x20) == 0x20;
			parentObj.gfxBackgroundBankOffset = ((data & 0x10) == 0x10) ? 0 : 0x80;
			parentObj.gfxBackgroundCHRBankPosition = ((data & 0x08) == 0x08) ? 0x400 : 0;
			parentObj.gfxSpriteNormalHeight = ((data & 0x04) == 0);
			parentObj.gfxSpriteShow = (data & 0x02) == 0x02;
			parentObj.bgEnabled = ((data & 0x01) == 0x01);
			parentObj.memory[0xFF40] = data;
		}
		this.memoryHighWriter[0x41] = this.memoryWriter[0xFF41] = function (parentObj, address, data) {
			parentObj.LYCMatchTriggerSTAT = ((data & 0x40) == 0x40);
			parentObj.mode2TriggerSTAT = ((data & 0x20) == 0x20);
			parentObj.mode1TriggerSTAT = ((data & 0x10) == 0x10);
			parentObj.mode0TriggerSTAT = ((data & 0x08) == 0x08);
			parentObj.memory[0xFF41] = data & 0x78;
			if ((!parentObj.usedBootROM || !parentObj.usedGBCBootROM) && parentObj.LCDisOn && parentObj.modeSTAT < 2) {
				parentObj.interruptsRequested |= 0x2;
				parentObj.checkIRQMatching();
			}
		}
		this.memoryHighWriter[0x46] = this.memoryWriter[0xFF46] = function (parentObj, address, data) {
			parentObj.memory[0xFF46] = data;
			if (data > 0x7F && data < 0xE0) {	//DMG cannot DMA from the ROM banks.
				data <<= 8;
				address = 0xFE00;
				var stat = parentObj.modeSTAT;
				parentObj.modeSTAT = 0;
				parentObj.resetOAMXCache();
				do {
					parentObj.memory[address++] = parentObj.memoryReader[data](parentObj, data++);
					parentObj.memoryWriteGBOAMRAMUnsafe(parentObj, address++, parentObj.memoryReader[data](parentObj, data++));
					parentObj.memory[address++] = parentObj.memoryReader[data](parentObj, data++);
					parentObj.memory[address++] = parentObj.memoryReader[data](parentObj, data++);
				} while (address < 0xFEA0);
				parentObj.modeSTAT = stat;
			}
		}
		this.memoryHighWriter[0x47] = this.memoryWriter[0xFF47] = function (parentObj, address, data) {
			if (parentObj.memory[0xFF47] != data) {
				parentObj.renderMidScanLine();
				parentObj.updateGBBGPalette(data);
				parentObj.memory[0xFF47] = data;
			}
		}
		this.memoryHighWriter[0x48] = this.memoryWriter[0xFF48] = function (parentObj, address, data) {
			if (parentObj.memory[0xFF48] != data) {
				parentObj.renderMidScanLine();
				parentObj.updateGBOBJPalette(0, data);
				parentObj.memory[0xFF48] = data;
			}
		}
		this.memoryHighWriter[0x49] = this.memoryWriter[0xFF49] = function (parentObj, address, data) {
			if (parentObj.memory[0xFF49] != data) {
				parentObj.renderMidScanLine();
				parentObj.updateGBOBJPalette(4, data);
				parentObj.memory[0xFF49] = data;
			}
		}
		this.memoryHighWriter[0x4D] = this.memoryWriter[0xFF4D] = function (parentObj, address, data) {
			parentObj.memory[0xFF4D] = data;
		}
		this.memoryHighWriter[0x4F] = this.memoryWriter[0xFF4F] = this.cartIgnoreWrite;	//Not writable in DMG mode.
		this.memoryHighWriter[0x55] = this.memoryWriter[0xFF55] = this.cartIgnoreWrite;
		this.memoryHighWriter[0x68] = this.memoryWriter[0xFF68] = this.cartIgnoreWrite;
		this.memoryHighWriter[0x69] = this.memoryWriter[0xFF69] = this.cartIgnoreWrite;
		this.memoryHighWriter[0x6A] = this.memoryWriter[0xFF6A] = this.cartIgnoreWrite;
		this.memoryHighWriter[0x6B] = this.memoryWriter[0xFF6B] = this.cartIgnoreWrite;
		this.memoryHighWriter[0x6C] = this.memoryWriter[0xFF6C] = this.cartIgnoreWrite;
		this.memoryHighWriter[0x70] = this.memoryWriter[0xFF70] = this.cartIgnoreWrite;
		this.memoryHighWriter[0x74] = this.memoryWriter[0xFF74] = this.cartIgnoreWrite;
	}
}
GameBoyCore.prototype.recompileBootIOWriteHandling = function () {
	//Boot I/O Registers:
	if (this.inBootstrap) {
		this.memoryHighWriter[0x50] = this.memoryWriter[0xFF50] = function (parentObj, address, data) {
			cout("Boot ROM reads blocked: Bootstrap process has ended.", 0);
			parentObj.inBootstrap = false;
			parentObj.disableBootROM();			//Fill in the boot ROM ranges with ROM  bank 0 ROM ranges
			parentObj.memory[0xFF50] = data;	//Bits are sustained in memory?
		}
		if (this.cGBC) {
			this.memoryHighWriter[0x6C] = this.memoryWriter[0xFF6C] = function (parentObj, address, data) {
				if (parentObj.inBootstrap) {
					parentObj.cGBC = ((data & 0x1) == 0);
					//Exception to the GBC identifying code:
					if (parentObj.name + parentObj.gameCode + parentObj.ROM[0x143] == "Game and Watch 50") {
						parentObj.cGBC = true;
						cout("Created a boot exception for Game and Watch Gallery 2 (GBC ID byte is wrong on the cartridge).", 1);
					}
					cout("Booted to GBC Mode: " + parentObj.cGBC, 0);
				}
				parentObj.memory[0xFF6C] = data;
			}
		}
	}
	else {
		//Lockout the ROMs from accessing the BOOT ROM control register:
		this.memoryHighWriter[0x50] = this.memoryWriter[0xFF50] = this.cartIgnoreWrite;
	}
}
//Helper Functions
GameBoyCore.prototype.toTypedArray = function (baseArray, memtype) {
	try {
		if (settings[5]) {
			return baseArray;
		}
		if (!baseArray || !baseArray.length) {
			return [];
		}
		var length = baseArray.length;
		switch (memtype) {
			case "uint8":
				var typedArrayTemp = new Uint8Array(length);
				break;
			case "uint16":
				var typedArrayTemp = new Uint16Array(length);
				break;
			case "int32":
				var typedArrayTemp = new Int32Array(length);
				break;
			case "float32":
				var typedArrayTemp = new Float32Array(length);
				break;
			default:
				cout("Could not convert an array to a typed array: Invalid type parameter.", 1);
				return baseArray;
		}
		for (var index = 0; index < length; index++) {
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
		if (!baseArray || !baseArray.length) {
			return [];
		}
		var arrayTemp = [];
		for (var index = 0; index < baseArray.length; ++index) {
			arrayTemp[index] = baseArray[index];
		}
		return arrayTemp;
	}
	catch (error) {
		cout("Conversion from a typed array failed: " + error.message, 2);
		return baseArray;
	}
}
GameBoyCore.prototype.getTypedArray = function (length, defaultValue, numberType) {
	try {
		if (settings[5]) {
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
		var arrayHandle = [];
		var index = 0;
		while (index < length) {
			arrayHandle[index++] = defaultValue;
		}
	}
	return arrayHandle;
}
GameBoyCore.prototype.ArrayPad = function (length, defaultValue) {
	var arrayHandle = [];
	var index = 0;
	while (index < length) {
		arrayHandle[index++] = defaultValue;
	}
	return arrayHandle;
}
GameBoyCore.prototype.resetOAMXCache = function () {
	for (var index = 0; index < 168; ++index) {
		this.OAMAddresses[index] = [];
	}
}
GameBoyCore.prototype.returnOAMXCacheCopy = function (array) {
	var arrayHandle = this.ArrayPad(168, null);
	for (var subindex = 0; subindex < 168; subindex++) {
		arrayHandle[subindex] = [];
	}
	if (array.length) {
		var index = 0;
		var length = 0;
		while (index < length) {
			length = array[index].length;
			for (subindex = 0; subindex < length; subindex++) {
				arrayHandle[index][subindex] = array[index][subindex];
			}
			++index;
		}
		cout("OAM sprite cached preserved.", 0);
	}
	return arrayHandle;
}