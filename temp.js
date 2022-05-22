
let fileExt = {
    js: 1,
    txt: 1,
    json: 1,
    html: 1,
    css: 1,
}

function getExtension (filename){
    let newName = filename.split('.').pop()
    if(fileExt[newName]){
       return newName
    }
    return  'txt'
}

console.log(getExtension('shivam.js'))
  