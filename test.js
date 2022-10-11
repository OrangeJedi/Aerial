import {tasklist} from 'tasklist';



function parseTaskList(taskList){
    console.log(taskList.find((element) => element.imageName.includes("StartMenu")));
}

setTimeout(displayTaskList,1500)

async function displayTaskList() {
    parseTaskList(await tasklist());
}

displayTaskList();