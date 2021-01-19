var passwordPass = false;
var usernamePass = false;
var requiredFieldsFilled = false;

$('#enableDelete').click(function() {
    console.log('button clicked')
    $('.delete-crew').removeClass('invisible');
});

$(document).ready(function() {
    prep_modal();
});

$('#foremanPassword').change( function(){
    let password = $('#foremanPassword').val();

    let upperCase= new RegExp('[A-Z]');
    let lowerCase= new RegExp('[a-z]');
    let numbers = new RegExp('[0-9]');

    if(password.length < 8 || password.match(upperCase) == null || password.match(lowerCase) == null || password.match(numbers) == null ){
        $('#foremanPassword').addClass('border-danger');
        passwordPass = false;
    }else{
        $('#foremanPassword').removeClass('border-danger');
        $('#foremanPassword').addClass('border-success');
        passwordPass = true;
    }

});

$('#foremanUsername').change( function(){
    let username = $('#foremanUsername').val();
    console.log(username);

    $.get( `/users/checkUsername?username=${username}`).done( function (data){
        console.log('Data',data);

        if(data == 'User was found'){
            $('#foremanUsername').removeClass('border-success');
            $('#foremanUsername').addClass('border-danger');
            usernamePass = false;
        }else if(data == 'No user found'){
            $('#foremanUsername').removeClass('border-danger');            
            $('#foremanUsername').addClass('border-success');
            usernamePass = true;
        }else{
            $('#foremanUsername').removeClass('border-success');
            $('#foremanUsername').addClass('border-danger');
        }
    });
    

});
  
function prep_modal()
{
    $(".modal").each(function() {
        $('#formSubmit').hide();
        var element = this;
        var pages = $(this).find('.modal-split');

        if (pages.length != 0)
        {
            pages.hide();
            pages.eq(0).show();

            var b_button = document.createElement("button");
            b_button.setAttribute("type","button");
            b_button.setAttribute("class","btn btn-primary");
            b_button.setAttribute("style","display: none;");
            b_button.innerHTML = "Back";

            var n_button = document.createElement("button");
            n_button.setAttribute("type","button");
            n_button.setAttribute("class","btn btn-primary");
            n_button.innerHTML = "Next";

            $(this).find('.modal-footer').append(b_button).append(n_button);


            var page_track = 0;

            $(n_button).click(function() {
                this.blur();
                
                if(page_track == 0)
                {
                    $(b_button).show();
                }

                if(page_track == 1)
                {
                    if(passwordPass && usernamePass){
                        $('#formSubmit').show();
                        $(n_button).hide();

                    }else{
                        $(n_button).hide();
                    }
                }

                //submit for when on last page
                if(page_track == pages.length-1)
                {
                    $(n_button).hide();

                }

                if(page_track < 2)
                {
                    page_track++;

                    pages.hide();
                    pages.eq(page_track).show();
                }
                console.log(page_track);
            });

            $(b_button).click(function() {

                if(page_track == 1)
                {
                    $(b_button).hide();
                }

                if(page_track == pages.length-1)
                {
                    $(n_button).text("Next");
                }

                if(page_track > 0)
                {
                    page_track--;

                    pages.hide();
                    pages.eq(page_track).show();
                }

                if(page_track == 0){
                    $(n_button).show();
                }
                console.log(page_track);

            });
        }
    });
}
