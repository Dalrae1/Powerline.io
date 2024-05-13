class GlobalFunctions {
    static SetNick(BitView, offset, nick) {
        for (var characterIndex = 0; characterIndex < nick.length; characterIndex++) {
            BitView.setUint16(offset + characterIndex * 2, nick.charCodeAt(characterIndex), true);
        }
        offset += (1 + nick.length) * 2;
        return BitView, offset
    }
}

module.exports = GlobalFunctions