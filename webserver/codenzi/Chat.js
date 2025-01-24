var Chat = function () {
    var visible = false;
    var element = null;

    function createElement(tag, id, css) {
        var element = document.createElement(tag);
        element.id = id;
        element.style.cssText = css;
        return element;
    }

    function escapeHtml(unsafeText) {
        const div = document.createElement('div');
        div.textContent = unsafeText;
        return div.innerHTML;
    }

    function addMessage(text, sender = "System") {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        const message = document.createElement('div');
        message.style.cssText = `
            display: flex; 
            align-items: flex-start; 
            margin-bottom: 5px; 
            padding: 5px; 
            background-color: rgba(0, 58, 58, 0.27); 
            border-radius: 5px; 
            color: #05ffff;
        `;
        message.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(text)}`;
        chatMessages.appendChild(message);

        // Scroll to the latest message
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function create() {
        let chat = createElement(
            'div',
            'chat',
            `
            z-index: 99; 
            display: none; 
            position: absolute;
            top: 0;
            left: 0;
            width: 30%;
            min-height: 300px;
            background-color: rgba(0, 58, 58, 0.45);
            border-radius: 10px;
            border: 2px solid #05ffff;
            color: #05ffff; 
            text-align: left; 
            box-shadow: 0 0 10px #05ffff;
            display: block;
            padding: 10px;`
        );

        // Container for messages
        let chatMessages = createElement(
            'div',
            'chat-messages',
            `
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding: 5px; 
            margin-bottom: 10px;
            max-height: 200px;
            border-radius: 5px;
            background-color: rgba(0, 58, 58, 0.1);`
        );

        // Chat input
        let chatInput = createElement(
            'input',
            'input-chat',
            `
            display: block;
            position: absolute;
            bottom: 10px;
            width: 90%; 
            height: 40px; 
            background-color: #003a3a;
            border-radius: 10px;
            border: 2px solid #05ffff;
            color: #05ffff; 
            padding: 5px 10px;
            box-shadow: inset 0 0 5px #05ffff;`
        );
        chatInput.setAttribute('maxlength', '50');
        chatInput.setAttribute('placeholder', 'Type a message...');
        chatInput.addEventListener('keydown', function (e) {
            if (e.keyCode === 13) {
                if (chatInput.value.trim() == '') {
                    return
                }
                if (chatInput.value.startsWith('/')) {
                    network.sendCommand(chatInput.value.slice(1));
                    chatInput.value = '';
                    return;
                }
                network.sendCommand('say ' + chatInput.value);
                chatInput.value = '';
            }
        });

        // Append elements to chat container
        chat.appendChild(chatMessages);
        chat.appendChild(chatInput);

        element = chat;
        element.style.display = 'block';

        document.body.appendChild(element);

        // Add custom scrollbar styles
        const style = document.createElement('style');
        style.textContent = `
            #chat-messages::-webkit-scrollbar {
                width: 8px;
            }
            #chat-messages::-webkit-scrollbar-thumb {
                background: #05ffff;
                border-radius: 10px;
                box-shadow: inset 0 0 5px rgba(0, 255, 255, 0.7);
            }
            #chat-messages::-webkit-scrollbar-thumb:hover {
                background: #02cccc;
            }
            #chat-messages::-webkit-scrollbar-track {
                background: rgba(0, 58, 58, 0.3);
                border-radius: 10px;
            }
            #chat-messages {
                scrollbar-width: thin;
                scrollbar-color: #05ffff rgba(0, 58, 58, 0.3);
            }
        `;

        window.addEventListener("keydown", function(e) { 
            switch(e.keyCode){ 
                case 37: case 39: case 38: case 40: 
                    e.preventDefault(); break; 

                case 13: // Focus
                    if (!(UIVisible && isStatsVisible)) {
                        if (document.activeElement == chatInput) {
                            chatInput.blur();
                            break
                        }
                        if (document.activeElement && document.activeElement.tagName != 'INPUT') {
                            chatInput.focus();
                        }
                    }
                    break
                default: break; 
            } 
        }, false); 
        document.head.appendChild(style);

        return chat;
    }

    return {
        domElement: create(),
        addMessage: addMessage,
    };
};

if (typeof module === 'object') {
    module.exports = Chat;
}
