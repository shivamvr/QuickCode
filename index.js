//----------------Theme------------

// fetch('./theme.json')
// .then(response => {
//    return response.json();
// })
// .then(data => console.log(data));

//   -------------------------------------
var codeContent = $.trim($("#CodeBlock").text());
$("#CodeBlock").html("");
let savedCode = localStorage.getItem("code");
var editor = monaco.editor.create(document.getElementById("CodeBlock"), {
  value: savedCode,
  language: "javascript",
  theme: "vs",
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

let codeBlock = get("#CodeBlock");

function saveIt() {
  let code = editor.getValue();
  localStorage.setItem("code", code);
  let saveCode = localStorage.getItem("code");
}


window.editor.getModel().onDidChangeContent((event) => {
    saveIt()
  });
