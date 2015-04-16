var ENDPOINT = "ws://10.32.32.156:1337";

var ServerActionCreators = require('../actions/ServerActionCreators');

module.exports = {

  launch: function() {
    return new Promise((resolve, reject) => {
      this.websocket = new ReconnectingWebSocket(ENDPOINT);
      console.log('realtime: connecting');
      this.websocket.onopen = function() {
        console.log("realtime: connected");
        resolve(this);
      };
      this.websocket.onerror = function(e) {
        console.log('realtime: error', arguments);
        reject(this);
      };
      this.websocket.onmessage = (e) => {
        if(e){
          var data = JSON.parse(e.data);
          this.decodeMessage(data);
        }
      }
    });
  },

  disconnect: function(){
    clearInterval(this.matchReadyPingInterval);
    this.websocket.disconnect();
  },

  matchPing: function(matchId, ownerId, matchName, players){
    this.publishMessage(this.getMessageToPublish({
      action: 'matchPing',
      matchId: matchId,
      ownerId: ownerId,
      matchName: matchName,
      players: players
    }));
  },

  startMatchReadyPing: function(matchId, ownerId, matchName, players){
    var that = this;
    this.matchReadyPingInterval = setInterval(function(){that.matchPing(matchId, ownerId, matchName, players)}, 2000);
  },

  stopMatchReadyPing: function(){
    clearInterval(this.matchReadyPingInterval);
  },

  getReadyMessage: function(matchId, ownerId){
    return this.getMessageToPublish({
      action: 'matchReady',
      matchId: matchId,
      ownerId: ownerId
    });
  },

  sendJoinMessage: function(match, playerId, playerName){
    this.publishMessage(this.getMessageToPublish({
        action: 'joinMatch',
        match: match,
        playerId: playerId,
        playerName: playerName
    }));
  },

  createMatch: function(playerId, playerName){
    this.publishMessage(this.getMessageToPublish({
        action: 'matchCreate',
        matchId: playerName + "'s match" + Math.random(),
        ownerId: playerId,
        matchName: playerName + "'s match",
        players: [{playerId: playerId, playerName: playerName}]
    }));
  },

  startMatch: function(match){
    this.publishMessage(this.getMessageToPublish({
        action: 'matchStart',
        match: match
    }));
  },

  sendCorrectAnswer: function(matchId){
    this.publishMessage(this.getMessageToPublish({
      action: 'correctAnswer',
      matchId: matchId
    }));
  },

  sendForeignCorrectAnswer: function(matchId, correctAnswer, ownerId){
    this.publishMessage(this.getMessageToPublish({
      action: 'setForeignCorrectAnswer',
      correctAnswer: correctAnswer,
      matchId: matchId,
      ownerId: ownerId
    }));
  },

  timerUpdate: function(matchId){
    this.publishMessage(this.getMessageToPublish({
      action: 'timerUpdate',
      matchId: matchId
    }));
  },

  publishMessage: function(msg) {
    var message = this.getMessageToPublish(msg);
    if(message) {
      this.websocket.send(msg);
    }
  },

  decodeMessage: function(data) {
    if (!data ) {
      return null;
    }

    var payload = JSON.parse(data.data.utf8Data).data;

    switch(payload.action){
        case 'matchCreate':
            ServerActionCreators.createdMatch(payload.matchId, payload.ownerId, payload.matchName);
            this.startMatchReadyPing(payload.matchId, payload.ownerId, payload.matchName, payload.players);
            break;
        case 'joinMatch':
            ServerActionCreators.joinedMatch(payload.match, payload.playerId, payload.playerName);
            break;
        case 'matchReady':
            ServerActionCreators.matchReady();
            break;
        case 'matchStart':
            ServerActionCreators.startMatch(payload.match);
            break;
        case 'matchPing':
            ServerActionCreators.matchAvailable(payload.matchId, payload.ownerId, payload.matchName, payload.players);
            break;
        case 'correctAnswer':
            ServerActionCreators.correctAnswer(payload.matchId);
            break;
        case 'timerUpdate':
            ServerActionCreators.timerUpdate(payload.matchId);
            break;
        case 'setForeignCorrectAnswer':
          ServerActionCreators.setForeignCorrectAnswer(payload.matchId, payload.correctAnswer, payload.ownerId);
    }
  },

  getMessageToPublish: function(msg){
    return JSON.stringify({
      data: msg
    });
  }
};


ReconnectingWebSocket = function (url, protocols) {
  protocols = protocols || [];

  // These can be altered by calling code.
  this.debug = false;
  this.reconnectInterval = 2000;
  this.timeoutInterval = 5000;

  var self = this;
  var ws;
  var forcedClose = false;
  var timedOut = false;

  this.url = url;
  this.protocols = protocols;
  this.readyState = WebSocket.CONNECTING;
  this.URL = url; // Public API

  this.onopen = function (event) {
  };

  this.onclose = function (event) {
  };

  this.onconnecting = function (event) {
  };

  this.onmessage = function (event) {
  };

  this.onerror = function (event) {
  };

  function connect(reconnectAttempt) {
    ws = new WebSocket(url, protocols);

    self.onconnecting();

    var localWs = ws;
    var timeout = setTimeout(function () {
      timedOut = true;
      localWs.close();
      timedOut = false;
    }, self.timeoutInterval);

    ws.onopen = function (event) {
      clearTimeout(timeout);
      self.readyState = WebSocket.OPEN;
      reconnectAttempt = false;
      self.onopen(event);
    };

    ws.onclose = function (event) {
      clearTimeout(timeout);
      ws = null;
      if (forcedClose) {
        self.readyState = WebSocket.CLOSED;
        self.onclose(event);
      } else {
        self.readyState = WebSocket.CONNECTING;
        self.onconnecting();
        if (!reconnectAttempt && !timedOut) {
          self.onclose(event);
        }
        setTimeout(function () {
          connect(true);
        }, self.reconnectInterval);
      }
    };

    ws.onmessage = function (event) {
      self.onmessage(event);
    };

    ws.onerror = function (event) {
      self.onerror(event);
    };
  }

  connect(url);

  this.send = function (data) {
    if (ws) {
      return ws.send(data);
    } else {
      throw 'INVALID_STATE_ERR : Pausing to reconnect websocket';
    }
  };

  this.close = function () {
    forcedClose = true;
    if (ws) {
      ws.close();
    }
  };

  /**
   * Additional public API method to refresh the connection if still open (close, re-open).
   * For example, if the app suspects bad data / missed heart beats, it can try to refresh.
   */
  this.refresh = function () {
    if (ws) {
      ws.close();
    }
  };
}