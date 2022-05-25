//------------template-css-------------
// emmetMonaco.emmetHTML(monaco)


var cssContent = $.trim($("#cssEditor").text());
$("#cssEditor").html("");

let savedcss = localStorage.getItem("css");

if(!savedcss){
localStorage.setItem("css",'');
}

var cssEditor = monaco.editor.create(document.getElementById("cssEditor"), {
  value: savedcss,
  language: 'css',
  lineNumber: "on",
  glyphmargin: false,
  vertical: "auto",
  horizontal: "auto",
  verticalScrollbarSize: 10,
  horizontalScrollbarSize: 10,
  scrollBeyoundLastLine: false,
  readOnly: false,
  automaticLayout: true,
  minimap: {
    enabled: true,
  },
  lineHeight: 30,
  scrollbar: {
    verticalScrollbarSize: 20,
    horizontalScrollbarSize: 17,
  },
});

//---------------------Save-to-loacalstorage--------------------------



