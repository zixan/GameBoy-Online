//Opacity Utility Class
//(c) 2009/2010 - Grant Galitz
function Opacity() {
	this.ElementObject = (typeof arguments[0] == "string") ? document.getElementById(arguments[0]) : arguments[0];        //No default, so it must be included (Either as an ID, or as the DOM element itself).
	this.RefOpacityAREABegin = (typeof arguments[1] == "number") ? arguments[1] : 0;                                      //The starting opacity.
	this.RefOpacityAREAEnd = (typeof arguments[2] == "number") ? arguments[2] : 100;                                      //The final target opacity.
	this.OpacityOffset =  (typeof arguments[3] == "number") ? arguments[3] : 4;                                           //The amount to increment the opacity by for every loop.
	this.TimeInterval = (typeof arguments[4] == "number") ? arguments[4] : 100;                                           //The time difference between every opacity alteration.
	this.InitialStartTime = (typeof arguments[5] == "number") ? arguments[5] : 0;                                         //When to acutally start the main loop.
	this.bNonstandard = (typeof arguments[6] == "boolean") ? arguments[6] : true;                                         //Whether to use css properties other than 'opacity' to access opacity.
	this.IEFILTERS = (typeof arguments[7] == "string") ? arguments[7] : "";                                               //Add an MSIE-proprietary filter.
	this.bSmartAdjust = (typeof arguments[8] == "boolean") ? arguments[8] : true;                                         //Whether to automatically alter the opacity to keep up with the delay in changing the opacity.
	this.fDoneEvent = (typeof arguments[9] == "function") ? arguments[9] : null;                                          //The function to execute when the loop is done (Can also be added by attachDoneEvent).
	this.bDoneEventRun = false;                                                                                           //To prevent duplicates...
	this.bDoneRun = false;
	if (this.bSmartAdjust) {
		this.startTime = new Date().getTime() + this.InitialStartTime;
	}
	this.opacityCheck();	                                                                                              //Check for opacity...
}
Opacity.prototype.opacityChangeLoop = function () {
	if (!this.isDone()) {
		var thisObj = this;
		this.timer = setTimeout(function () { thisObj.opacityOnChange(); }, thisObj.TimeInterval);
	}
	else {
		this.RefOpacityAREABegin = this.RefOpacityAREAEnd;
		this.opacityAlter(this.RefOpacityAREAEnd);
		this.doneEvent();
	}
}
Opacity.prototype.opacityOnChange = function () {
	if (this.bSmartAdjust) {
		this.RefOpacityAREABegin += ((new Date().getTime() - this.startTime) / this.TimeInterval) * this.OpacityOffset;	//Calculate the time it took to change the opacity against one time delay, then multiply against the offset.
		this.startTime = new Date().getTime() + this.TimeInterval;
	}
	this.RefOpacityAREABegin = (this.isDone()) ? this.RefOpacityAREAEnd : this.RefOpacityAREABegin;
	this.opacityAlter(this.RefOpacityAREABegin);
	this.setNextLoop();
}
Opacity.prototype.opacityAlter = function (LocalOpacity) {
	if (typeof this.ElementObject == "object" && this.ElementObject != null && !this.bDoneRun && !this.bDoneEventRun) {
		LocalOpacity = ((LocalOpacity > 0) ? ((LocalOpacity < 100) ? LocalOpacity : 100) : 0);
		cout("In Opacity::opacityAlter : LocalOpacity=" + LocalOpacity, -1);
		this.ElementObject.style.opacity = LocalOpacity / 100;
		if (this.bNonstandard) {
			this.ElementObject.style.MozOpacity = LocalOpacity / 100;
			this.ElementObject.style.KhtmlOpacity = LocalOpacity / 100;
			this.ElementObject.style.filter = "progid:DXImageTransform.Microsoft.Alpha(opacity=" + LocalOpacity + ")" + ((this.IEFILTERS.length > 0) ? ", " + this.IEFILTERS : "");
		}
	}
}
Opacity.prototype.setNextLoop = function () {
	this.RefOpacityAREABegin += this.OpacityOffset;
	this.opacityChangeLoop();
}
Opacity.prototype.isDone = function () {
	return (this.bDoneEventRun || this.bDoneRun || !((this.OpacityOffset > 0 && this.RefOpacityAREABegin < this.RefOpacityAREAEnd) || (this.OpacityOffset < 0 && this.RefOpacityAREABegin > this.RefOpacityAREAEnd)));
}
Opacity.prototype.opacityCheck = function () {
	if (typeof this.ElementObject == "object" && this.ElementObject != null) {
		if (typeof this.ElementObject.style.opacity == "undefined") {
			if (this.bNonstandard) {
				if (typeof this.ElementObject.style.MozOpacity == "undefined" && typeof this.ElementObject.style.KhtmlOpacity == "undefined" && typeof this.ElementObject.style.filter == "undefined") {
					return this.doneEvent();
				}
				else if (typeof this.ElementObject.style.filter != "undefined") {	//MSIE Filter Access
					if (typeof this.ElementObject.currentStyle.hasLayout == "undefined") {	//MSIE uses hasLayout for its filter logic.
						return this.doneEvent();
					}
				}
			}
			else {
				return this.doneEvent();
			}
		}
		//Passed Checks... Start Timing:
		var thisObj = this;
		this.timer = setTimeout(function () { thisObj.opacityOnChange(); }, thisObj.InitialStartTime);
	}
}
Opacity.prototype.doneEvent = function () {
	this.bDoneRun = true;
	if (!this.bDoneEventRun && typeof this.fDoneEvent == "function") {
		this.bDoneEventRun = true;
		this.fDoneEvent();
	}
}
Opacity.prototype.attachDoneEvent = function (event) {
	this.fDoneEvent = event;
	if (this.isDone() || this.bDoneRun) {
		this.doneEvent();
	}
}
