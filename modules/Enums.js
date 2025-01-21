const ServerToClient = {
    OPCODE_SC_PING: 0x00,
    OPCODE_SC_PONG: 0x01,
    OPCODE_CONFIG: 0xA0,
    OPCODE_CONFIG_2: 0xB0,
    OPCODE_ENTERED_GAME: 0xA1,
    OPCODE_ENTITY_INFO: 0xA3,
    OPCODE_EVENTS: 0xA4,
    OPCODE_LEADERBOARD: 0xA5,
    OPCODE_MINIMAP: 0xA6, // Unused
    // CUSTOM

    OPCODE_DEBUGCIRCLE: 0xA7,
    OPCODE_CUSTOM_TALK: 0xA8,
    OPCODE_MAP_BARRIERS: 0xA9,
};

const ClientToServer = {
    OPCODE_CS_PING: 0x00,
    OPCODE_CS_PONG: 0x10,
    OPCODE_HELLO: 0x01,
    OPCODE_HELLO_V2: 0xAE,
    OPCODE_HELLO_V3: 0xAF,
    OPCODE_HELLO_V4: 0xBF,
    OPCODE_HELLO_DEBUG: 0xAB,
    OPCODE_ENTER_GAME: 0x03,
    OPCODE_LEAVE_GAME: 0x04,
    OPCODE_INPUT: 0x05,
    OPCODE_INPUT_POINT: 0x06,
    OPCODE_AREA_UPDATE: 0x07,
    OPCODE_BOOST: 0x08,
    OPCODE_DEBUG_GRAB: 0x09,
    OPCODE_BIG_PICTURE: 0x0B,
    OPCODE_TALK: 0x0C
};

const EventCodes = {
    EVENT_DID_KILL: 0x01,
    EVENT_WAS_KILLED: 0x02
};

const EntityTypes = {
    ENTITY_ITEM: 4,
    ENTITY_PLAYER: 5,
    ENTITY_COLLIDER: 1 // Unused
};

const EntitySubtypes = {
    SUB_ENTITY_ITEM_FOOD: 0
};

const UpdateTypes = {
    UPDATE_TYPE_PARTIAL: 0x0,
    UPDATE_TYPE_FULL: 0x1,
    UPDATE_TYPE_DELETE: 0x02
};

const EntityFlags = {
    DEBUG: 0x01,
    IS_RUBBING: 0x02,
    IS_BOOSTING: 0x04,
    PING: 0x08,
    KILLED_KING: 0x10,
    KILLSTREAK: 0x20,
    SHOW_TALKING: 0x40,
    // Custom
    SHOW_CUSTOM_TALKING: 0x80,
    CUSTOM_COLOR: 0x100,
};

const KillReasons = {
    LEFT_SCREEN: 0x0,
    KILLED: 0x01,
    BOUNDARY: 0x02,
    SELF: 0x03
};

const Directions = {
    NONE: 0x0,
    UP: 0x01,
    LEFT: 0x02,
    DOWN: 0x03,
    RIGHT: 0x04
};

module.exports = {
    ServerToClient,
    ClientToServer,
    EventCodes,
    EntityTypes,
    EntitySubtypes,
    UpdateTypes,
    EntityFlags,
    KillReasons,
    Directions
};