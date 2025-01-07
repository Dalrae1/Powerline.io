var CommandPallete = function () {
    var visible = false;
    var element = null
    function createElement( tag, id, css ) {

		var element = document.createElement( tag );
        element.id = id;
        element.maxLength = 25;
		element.style.cssText = css;
		return element;

    }
    
    function create() {
        let input = createElement('input', 'input-command', 'z-index: 99; display: none; transform: translateX(-50%);margin-left: 50%; position: absolute;top: -30vh;width: 10%;height: 35px;background-color: #003a3a;border-radius: 5px;border-width: 2px;border-color: #05ffff;color: #05ffff; text-align: left; box-shadow: 0 0 10px #05ffff;');
        input.setAttribute('placeholder', 'Type a command...');
        input.addEventListener('keydown', function (e) {
            if (e.keyCode == 13) {
                enterCommand(input.value);
            }
        });
        element = input
        return input
    }
    function toggle() {
        visible = !visible
        if (visible)
            setTimeout(function () {
                element.style.display = 'block';
                element.focus();
                element.value = '';
            }, 10);
        else
            element.style.display = 'none';
    }

    function isVisible() {
        return visible
    }
    
    
    enterCommand = function (command) {
        let commandArgs = command.split(' ');
        if (commandArgs.length == 0) {
            return;
        }
        switch (commandArgs[0]) {
            case "edit":
                let chatIndex = parseInt(commandArgs[1]);
                let chatReplace = commandArgs.slice(2).join(' ');
                if (chatIndex != NaN) {
                    window.localStorage[`chatOverride${commandArgs[1]}`] = chatReplace;
                }
                break;
            default: 
                network.sendCommand(command);
                break;
        }
        element.style.display = 'none';
        visible = false
    }

    return {
        domElement: create(),
        isVisible: isVisible,
        toggle: toggle
    }
    

};

if ( typeof module === 'object' ) {

	module.exports = CommandPallete;

}