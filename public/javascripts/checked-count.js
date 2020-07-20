$(document).ready(function($)
{ 	
    function check(){
        checkboxes();
        countCheckboxes();
    }

    function checkboxes(){
        $("input:checkbox").attr("checked", function(index, attr){
            console.log(attr)
            return attr == "checked" ? false : true;
        })
    }

    function countCheckboxes(){
        console.log('hello')
        var inputElems = document.getElementsByTagName("input:checkbox"),
        count = 0;
        for (var i=0; i<inputElems.length; i++) {
            if (inputElems[i].type === "checkbox" && inputElems[i].checked === true){
                count++;
                alert(count);
                console.log(count)
            }
        }
    }
})