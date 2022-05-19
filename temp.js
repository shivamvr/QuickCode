function saveAsFile(sourceText, fileName) {
    var workElement = document.createElement("a");
    if ('download' in workElement) {
        workElement.href = "data:" + 'text/plain' + "charset=utf-8," + escape(sourceText);
        workElement.setAttribute("download", fileName);
        document.body.appendChild(workElement);
        var eventMouse = document.createEvent("MouseEvents");
        eventMouse.initMouseEvent("click", true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        workElement.dispatchEvent(eventMouse);
        document.body.removeChild(workElement);
    } else throw 'File saving not supported for this browser';
}

