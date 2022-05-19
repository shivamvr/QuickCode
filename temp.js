
function saveFile(){
let text = 'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.8/FileSaver.js \n https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.8/FileSaver.js'
var name = 'myfile.txt';
const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
saveAs(blob, name);
}

let btn = get('#btn')
btn.onclick = saveFile

import myTheme from './theme.mjs'

console.log(myTheme())

function readTextFile(file)
{
    var rawFile = new XMLHttpRequest();
    rawFile.open("GET", file, false);
    rawFile.onreadystatechange = function ()
    {
        if(rawFile.readyState === 4)
        {
            if(rawFile.status === 200 || rawFile.status == 0)
            {
                var allText = rawFile.responseText;
                // alert(allText);
            }
        }
    }
    rawFile.send(null);
}

readTextFile('./theme.mjs')

document.getElementById("file").addEventListener("change", function () {
    var file = new FileReader();
    file.onload = () => {
        get('.code').innerText = file.result + ''
      console.log(file.result + "");
    };
    file.readAsText(this.files[0]);
  });


