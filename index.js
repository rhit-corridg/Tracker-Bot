const Discord = require("discord.js");
const botconfig = require("./botconfig.json");
const request = require("request");
const bot = new Discord.Client({ disableEveryone: true });
const dotenv = require("dotenv");

dotenv.config();

bot.login(process.env.TOKEN);
function GetServerNumber(serverIP, serverPort) {
	switch (`${serverIP}:${serverPort}`) {
		case "server.tycoon.community:30120":
			return "1";
		case "server.tycoon.community:30121":
			return "2";
		default:
			return "idk";
	}
}

function distanceBetweenCoords(x1, y1, x2, y2) {
	//Get the distance between two x,y coords
	const differenceInX = x2 - x1;
	const differenceInY = y2 - y1;

	const whatToSqrt =
		differenceInX * differenceInX + differenceInY * differenceInY;
	const answer = Math.sqrt(whatToSqrt);
	return answer;
}
bot.on("ready", async () => {
	bot.user.setActivity("PIGS Robbebery", { type: "PLAYING" });

	console.log(`${bot.user.username} is online!`); //logs that the bot is online

	checkServer(0, []);

	const HeistChannel = bot.channels.get(process.env.HEIST_CHANNEL); //Gets heist channel

	function checkServer(index, donttrack) {
		//Find people heisting in server
		console.log("Checking server index ", index);
		request(
			`http://${botconfig.ActiveServers[index][0]}:${botconfig.ActiveServers[index][1]}/status/map/positions.json`,
			{
				headers: {
					"X-Tycoon-Key": process.env.TYCOON_KEY
				}
			},
			function (error, response, body) {
				//url to get all players
				if (error) {
					//server is offline
					console.log("server offline");
					if (index >= botconfig.ActiveServers.length - 1) {
						console.log("Waiting 5 minutes");
						setTimeout(() => {
							//after 1000 ms
							checkServer(0, []);
						}, 5 * 60000);
					} else {
						checkServer(index + 1, donttrack); //check next one after 500 ms
					}

					return;
				}

				const jsonBody = JSON.parse(body); //convert to json so we can use it

				let CurrentServerPoints = 0; //start at 0 people playing

				let ToTrack = null;

				jsonBody.players.forEach(player => {
					if (player[5].group == "pigs_job" && !donttrack.includes(player[2])) {
						CurrentServerPoints++; //if theres someone with a pigs job increase points
						if (!ToTrack) ToTrack = player;
						else if (player[2] < ToTrack[2]) ToTrack = player;
					}
				});

				if (CurrentServerPoints >= 2) {
					console.log("Found ", CurrentServerPoints);
					getPlayerLocation(
						botconfig.ActiveServers[index][0],
						botconfig.ActiveServers[index][1],
						ToTrack,
						"None",
						1
					);
				} else {
					if (index < botconfig.ActiveServers.length - 1) {
						//if its not the last server
						console.log("Couldn't find enough");

						checkServer(index + 1, donttrack); //check next one after 500 ms
					} else {
						//last one
						console.log("Waiting 5 minutes");
						setTimeout(() => {
							//after 1000 ms
							checkServer(0, []);
						}, 5 * 60000);
					}
				}
			}
		);
	}
	function getPlayerLocation(
		ServerIP,
		ServerPORT,
		Tracking,
		LastPosition,
		TimesAtLocation
	) {
		console.log(
			"Getting player location",
			ServerIP,
			ServerPORT,
			Tracking,
			LastPosition,
			TimesAtLocation
		);
		request(
			`http://${ServerIP}:${ServerPORT}/status/map/positions.json`,
			{
				headers: {
					"X-Tycoon-Key": process.env.TYCOON_KEY
				}
			},
			function (error, response, body) {
				//Get players on server
				if (!error) {
					//No error
					let foundPerson = false; //Haven't found person

					body = JSON.parse(body); //parse body

					body.players.forEach(player => {
						//Loop through all players
						if (player[2] == Tracking[2]) {
							//if in game ID is equal to the one told to search
							console.log("Found player");
							if (player[5].group != "pigs_job")
								return HeistChannel.send("Player is no longer heisting");
							foundPerson = true; //found person

							let currentCoords = player[3]; //Current coords is the player

							let closeToAnything = false; //Not close to anything

							botconfig.heistLocations.forEach(coords => {
								//Go through all positions
								if (
									coords.DistanceNeeded >
									distanceBetweenCoords(
										currentCoords.x,
										currentCoords.y,
										coords.x,
										coords.y
									)
								) {
									//if closer to coords than distance needed
									closeToAnything = true; //set close to anything
									console.log("Found location");
									if (coords.name != LastPosition) {
										//If the name is not the same as the last position
										let playersThere = []; //Get players there
										console.log("New location");
										HeistChannel.send(
											`**${player[0]}** is currently at **${
												coords.name
											}** on **server ${GetServerNumber(
												ServerIP,
												ServerPORT
											)}**`
										); //say where they are
										LastPosition = coords.name;
										TimesAtLocation = 1;
										let alreadyThere = new Discord.RichEmbed()
											.setTitle(`People at ${coords.name}.`)
											.setColor("RANDOM");

										body.players.forEach(player => {
											//Go through all players
											let personCoords = player[3]; //Get their coords

											if (personCoords) {
												//if they have coords
												if (
													coords.DistanceNeeded >
													distanceBetweenCoords(
														personCoords.x,
														personCoords.y,
														coords.x,
														coords.y
													)
												) {
													//If they are close to the place
													alreadyThere.addField(player[0], player[2], true); //Add to embed
													playersThere.push(player[2]); //Add to array
												}
											}
										});
										if (alreadyThere.fields[0]) {
											//If theres more than just the person
											HeistChannel.send(alreadyThere).then(msg => {
												//Send embed
												checkForNewPlayers(
													msg,
													coords,
													playersThere,
													ServerIP,
													ServerPORT
												); //Check for more arriving players
											});
										}
									} else {
										TimesAtLocation++;
										console.log(TimesAtLocation);
									}
								}
							});
							if (TimesAtLocation == 65) {
								HeistChannel.send("Player is AFK");
								checkServer(0, [Tracking[2]]);
								return;
							}
							if (!closeToAnything && LastPosition != "transit") {
								//If the player isn't close to a heighst location and the last position isn't transit
								console.log("Not close to anything");
								HeistChannel.send(`**${player[0]}** is currently in transit`); //say they are in transit
								setTimeout(() => {
									getPlayerLocation(
										ServerIP,
										ServerPORT,
										Tracking,
										"transit",
										1
									); //after 6500 ms get the heist leaders position
								}, 6500);
							} else {
								if (LastPosition == "transit") TimesAtLocation++;
								console.log("Still not close to anything");
								setTimeout(() => {
									getPlayerLocation(
										ServerIP,
										ServerPORT,
										Tracking,
										LastPosition,
										TimesAtLocation
									); //after 6500 ms get the heist leaders position
								}, 6500);
							}
						}
					});
					if (!foundPerson) {
						//If didn't find the player
						HeistChannel.send("Player left the server");
						checkServer(0, []);
						return;
					}
				} else {
					//Error getting server
					HeistChannel.send("Server is offline");
					checkServer(0, []);
				}
			}
		);
	}

	function checkForNewPlayers(
		msg,
		location,
		playersThere,
		ServerIP,
		ServerPORT
	) {
		console.log("Checking for new players");
		request(
			`http://${ServerIP}:${ServerPORT}/status/map/positions.json`,
			{
				headers: {
					"X-Tycoon-Key": process.env.TYCOON_KEY
				}
			},
			function (error, response, body) {
				//Get players
				if (error) return;

				body = JSON.parse(body);
				let alreadyThere = new Discord.RichEmbed() //new embed that has same color and title as previous one
					.setColor(msg.embeds[0].color)
					.setTitle(msg.embeds[0].title);

				msg.embeds[0].fields.forEach(element => {
					//GO through all old embed fields and add it to the new embed
					alreadyThere.addField(element.name, element.value, true);
				});
				let NewPeople = false;
				body.players.forEach(player => {
					//Go through all players on the server
					if (!playersThere.includes(player[2])) {
						//If theres there doesn't include the player in the server
						let personCoords = player[3]; //Get that players coords

						if (personCoords) {
							//If they have coords
							if (
								location.DistanceNeeded >
								distanceBetweenCoords(
									personCoords.x,
									personCoords.y,
									location.x,
									location.y
								)
							) {
								//Check if they are at the same location
								alreadyThere.addField(player[0], player[2], true); //add to embed
								playersThere.push(player[2]); //add to array
								NewPeople = true;
							}
						}
					}
				});
				if (alreadyThere.fields[0]) {
					//if at least one person
					msg.edit(alreadyThere).then(msg => {
						//Edit the old embed with new one
						if (NewPeople) {
							//if people are still coming
							setTimeout(() => {
								checkForNewPlayers(
									msg,
									location,
									playersThere,
									ServerIP,
									ServerPORT
								); //after 2000ms check for more new players
							}, 2000);
						}
					});
				}
			}
		);
	}
});

bot.on("error", error => {
	//when theres a discord error
	console.log(error);
});

bot.on("disconnect", () => {
	//when the bot disconnects
	bot.login(process.env.TOKEN); //reconnect
});
