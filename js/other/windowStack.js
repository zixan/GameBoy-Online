var windowStacks = [];
function windowCreate(sId, bShow) {
	var oWindow = new windowStack(document.getElementById(sId));
	if (bShow) {
		oWindow.show();
	}
	return oWindow;
}
function windowStack(element) {
	if (element != null && typeof element == "object") {
		this.lastOpacity = null;
		this.domObject = element;
		this.hadFocus = true;
		this.hookedMouse = false;
		var thisObj2 = this;
		this.events = [
			["mousedown", function (event) { thisObj2.dragEnable(event); }],
			["mousemove", function (event) { thisObj2.drag(event); }],
			["mouseup", function (event) { thisObj2.dragDisable(); }]
		];
	}
	else {
		cout("In windowStack::windowStack() : The DOM element passed was invalid.", 2);
	}
}
windowStack.prototype.registerMouseEvents = function () {
	if (!this.hookedMouse) {
		this.hookedMouse = true;
		cout("windowStack::registerMouseEvents() called.", -1);
		for (eventIndex in this.events) {
			addEvent(this.events[eventIndex][0], document, this.events[eventIndex][1]);
		}
		this.center();
	}
	else {
		cout("In windowStack::registerMouseEvents() : this.hookedMouse reported true, ignoring request to register mouse events.", 1);
	}
}
windowStack.prototype.unregisterMouseEvents = function () {
	if (this.hookedMouse) {
		this.hookedMouse = false;
		cout("windowStack::unregisterMouseEvents() called.", -1);
		for (eventIndex in this.events) {
			removeEvent(this.events[eventIndex][0], document, this.events[eventIndex][1]);
		}
	}
	else {
		cout("In windowStack::unregisterMouseEvents() : this.hookedMouse reported false, ignoring request to unregister mouse events.", 1);
	}
}
windowStack.prototype.getStyleFloatOf = function (propertyNameOf, JSpropertyNameOf) {
	cout("windowStack::getStyleFloatOf() called.", -1);
	try {
		var dirtyValue = window.getComputedStyle(this.domObject, null).getPropertyValue(propertyNameOf);
	}
	catch (error) {
		try {
			var dirtyValue = this.domObject.currentStyle.getAttribute(JSpropertyNameOf);	/*JS object notation style keywords, not the CSS keywords!*/
		}
		catch (error) {
			cout(error.message, 2);
		}
	}
	var cleanValue = parseFloat((dirtyValue != null && dirtyValue.length) ? dirtyValue : "0");
	return (!isNaN(cleanValue) && cleanValue != -1) ? cleanValue : 0;	/*Note: Opera gives -1, not NaN for cleanValue when no number is found.*/
}
windowStack.prototype.dragEnable = function (event) {
	var elementAt = document.elementFromPoint(event.clientX, event.clientY);
	this.leftPos = this.getStyleFloatOf("left", "left");
	this.topPos = this.getStyleFloatOf("top", "top");
	var highX = this.leftPos + this.domObject.offsetWidth - document.documentElement.scrollLeft - document.getElementsByTagName("body")[0].scrollLeft;
	var highY = this.topPos + this.domObject.offsetHeight - document.documentElement.scrollTop - document.getElementsByTagName("body")[0].scrollTop;
	var mousedWindow = isSameNode(elementAt, this.domObject);
	this.mousedInsideWindow = (mousedWindow) ? false : isDescendantOf(this.domObject, elementAt);
	if (mousedWindow || this.mousedInsideWindow) {
		this.movable = true;
		this.leftLast = event.clientX;
		this.topLast = event.clientY;
		//this.lastOpacity = new Opacity(this.domObject, this.interceptOpacity(), 100, 1, 25, 0, true, "progid:DXImageTransform.Microsoft.Shadow(Color='#1E1E1E', strength='7', direction='135')");
		this.domObject.style.zIndex = 2;
		if (highX - this.leftLast < 25 && highY - this.topLast < 25) {	/*Inivisible resize corner area for windows.*/
			this.resize = true;
			cout("In windowStack::dragEnable() : Setup properties for a window resize event.", -1);
		}
		else {
			this.resize = false;
			cout("In windowStack::dragEnable() : Setup properties for a window drag event.", -1);
		}
		this.coordDiffLeft = this.leftLast - this.leftPos;
		this.coordDiffTop = this.topLast - this.topPos;
		this.lastLeft = 0;
		this.lastTop = 0;
	}
	else {
		this.lostFocus();
		cout("In windowStack::dragEnable() : mousedWindow and this.mousedInsideWindow were false, so dragging setup ignored.", -1);
	}
}
windowStack.prototype.drag = function (event) {
	if (this.movable) {
		this.lastLeft += event.clientX - this.coordDiffLeft;
		this.lastTop += event.clientY - this.coordDiffTop;
		if (this.resize) {
			var newWidth = this.domObject.clientWidth + event.clientX - this.leftLast - this.getStyleFloatOf("padding-left", "paddingLeft") - this.getStyleFloatOf("padding-right", "paddingRight");
			var newHeight = this.domObject.clientHeight + event.clientY - this.topLast - this.getStyleFloatOf("padding-top", "paddingTop") - this.getStyleFloatOf("padding-bottom", "paddingBottom");
			if (this.getStyleFloatOf("min-width", "minWidth") <= newWidth && this.getStyleFloatOf("min-height", "minHeight") <= newHeight && ((this.getStyleFloatOf("max-width", "maxWidth") >= newWidth || this.getStyleFloatOf("max-width", "maxWidth") == 0) && (this.getStyleFloatOf("max-height", "maxHeight") >= newHeight || this.getStyleFloatOf("max-height", "maxHeight") == 0))) {
				this.domObject.style.width = newWidth + "px";
				this.domObject.style.height = newHeight + "px";
				cout("In windowStack::drag() : Changed the selected window's dimensions to " + this.domObject.style.width + " by " + this.domObject.style.height + ".", -1);
			}
			else {
				cout("In windowStack::drag() : Ignored a width and/or height change, because the new size was out of bounds.", -1);
			}
		}
		else if (!this.mousedInsideWindow) {
			this.domObject.style.left = this.lastLeft + "px";
			this.domObject.style.top = this.lastTop + "px";
			cout("In windowStack::drag() : Moved selected window to (" + this.lastLeft + ", " + this.lastTop + ").", -1);
		}
		else {
			cout("In windowStack::drag() : No action taken.", -1);
		}
		this.coordDiffLeft = this.leftLast = event.clientX;
		this.coordDiffTop = this.topLast = event.clientY;
	}
	else {
		cout("In windowStack::drag() : this.movable was false, so dragging ignored.", -1);
	}
}
windowStack.prototype.dragDisable = function () {
	this.movable = false;
	this.hadFocus = true;
	cout("windowStack::dragDisable() called.", -1);
}
windowStack.prototype.lostFocus = function () {
	if (this.hadFocus) {
		cout("windowStack::lostFocus() called.", -1);
		//this.lastOpacity = new Opacity(this.domObject, this.interceptOpacity(), 60, -1, 25, 0, true, "progid:DXImageTransform.Microsoft.Shadow(Color='#1E1E1E', strength='7', direction='135')");
		this.domObject.style.zIndex = 1;
		this.hadFocus = false;
	}
}
windowStack.prototype.interceptOpacity = function () {
	cout("windowStack::interceptOpacity() called.", -1);
	if (this.lastOpacity != null) {
		this.lastOpacity.bDoneRun = true;
		return this.lastOpacity.RefOpacityAREABegin;
	}
	var sampledOpacity = this.getStyleFloatOf("opacity", "opacity") * 100;
	return (sampledOpacity > 0) ? sampledOpacity : 100;	/*Dirty opacity first-set for IE*/
}
windowStack.prototype.center = function () {
	cout("windowStack::center() called.", -1);
	var docWidth = Math.max(document.documentElement.clientWidth, document.getElementsByTagName("body")[0].clientWidth);
	var docHeight = Math.max(document.documentElement.clientHeight, document.getElementsByTagName("body")[0].clientHeight);
	var docLeft = Math.max(document.documentElement.scrollLeft, document.getElementsByTagName("body")[0].scrollLeft);
	var docTop = Math.max(document.documentElement.scrollTop, document.getElementsByTagName("body")[0].scrollTop);
	this.domObject.style.left = Math.round(((docWidth - this.domObject.offsetWidth) / 2) + docLeft) + "px";
	this.domObject.style.top = Math.round(((docHeight - this.domObject.offsetHeight) / 2) + docTop) + "px";
}
windowStack.prototype.hide = function () {
	cout("windowStack::hide() called.", -1);
	this.domObject.style.display = "none";
	this.unregisterMouseEvents();
}
windowStack.prototype.show = function () {
	cout("windowStack::show() called.", -1);
	this.domObject.style.display = "block";
	this.registerMouseEvents();
}
function popupMenu(oClick, oMenu) {
	this.clickElement = oClick;
	this.menuElement = oMenu;
	var thisObj2 = this;
	this.eventHandle = [
		function (event) { thisObj2.startPopup(event); },
		function (event) { thisObj2.endPopup(event); }
	];
	this.open = false;
	addEvent("click", this.clickElement, this.eventHandle[0]);
}
popupMenu.prototype.startPopup = function (event) {
	if (!this.open) {
		this.open = true;
		cout("popupMenu::startPopup() called.", -1);
		this.menuElement.style.display = "block";
		removeEvent("click", this.clickElement, this.eventHandle[0]);
		this.position(event);
		addEvent("mouseout", this.menuElement, this.eventHandle[1]);
	}
	else {
		cout("In popupMenu::startPopup() : Popup was already open.", 1);
	}
}
popupMenu.prototype.endPopup = function (event) {
	if (this.open) {
		if (mouseLeaveVerify(this.menuElement, event)) {
			this.open = false;
			cout("popupMenu::endPopup() called.", -1);
			this.menuElement.style.display = "none";
			removeEvent("mouseout", this.menuElement, this.eventHandle[1]);
			addEvent("click", this.clickElement, this.eventHandle[0]);
		}
		else {
			cout("In popMenu::endPopup : The mouse did not leave the popup.", -1);
		}
	}
	else {
		cout("In popupMenu::endPopup() : Popup was already closed.", -1);
	}
}
popupMenu.prototype.position = function (event) {
	if (this.open) {
		cout("popupMenu::position() called.", -1);
		this.menuElement.style.left = (pageXCoord(event) - 5) + "px";
		this.menuElement.style.top = (pageYCoord(event) - 5) + "px";
	}
	else {
		cout("In popupMenu::position() : Popup could not be positioned, because it's closed.", 1);
	}
}