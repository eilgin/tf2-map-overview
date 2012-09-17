/*
=============================================================================================
Map overview plugin for TF2

VERSION		: 0.1
AUTHOR		: eilgin
DESCRIPTION	: Capture player's movements
REQUIREMENTS	: Sourcemod 1.4+

VERSION HISTORY	: 
	0.1	- First Public release
=============================================================================================

FIXED:
 - check if the handle is valid : see http://forums.alliedmods.net/showpost.php?p=1564693&postcount=2
 - JSON schema looks like this :
 * {"interval":number,
 *         "records":[{"frame":number,
 *                     "data:[{"client":"string",
 *                             "class":number,
 *                             "pos":[array],
 *                             "angle:[array]
 *                            },...
 *                           ]
 *                    },...
 *                   ]
 *        }
 - See why we don't have 12 players in a record but 6vs5
 - Catching the default value of tv_snapshotrate

TODO:
 - Which event is the most reliable when ending a match ? teamplay_restart_round OR tf_game_over
 - Use MessagePack for serialization
 - Closing opened file(s) when tournament config is reloaded (catch last filename ?)
*/

#pragma semicolon 1
#define TEAM_OFFSET 2 // 2-red, 3-blu
#include <sourcemod>
#include <sdktools>
#include <tf2_stocks>
#include "map-overview/utils.inc"

public Plugin:myinfo = 
{
	name = "Map overview for TF2",
	author = "eilgin",
	description = "Its just a simple plugin which takes the players position every N frames",
	version = "1.0",
	url = "nope" // http://www.tf2pug.com ?
}

//----------------------------------------------------------------------------
//| Variables
//----------------------------------------------------------------------------
new g_snapshotRate = 10; // rate per second (default 10)
const maxlength = 256; // default buffer size for strings
new Handle:mo_hFile = INVALID_HANDLE; // records go here
new String:mo_LatestFileName[maxlength];
new bool:mo_bRecordingInfo = false; // set if tournament mode is ON and READY
new Handle:mo_hGetPlayersInfo = INVALID_HANDLE; // pointer to output file
/*new String:g_TF2ClassName[][] =
{
	"unknown",
	"scout",
	"sniper",
	"soldier",
	"demoman",
	"medic",
	"heavy",
	"pyro",
	"spy",
	"engineer"
};*/
	

//----------------------------------------------------------------------------
//| Plugin start up
//----------------------------------------------------------------------------
public OnPluginStart()
{
	// Game restart
	HookEvent("teamplay_restart_round", Event_GameRestart);
	
	// Win conditions met (maxrounds, timelimit)
	HookEvent("teamplay_game_over", Event_GameOver);
	
	// Win conditions met (windifference)
	HookEvent("tf_game_over", Event_GameOver);
	
	// Hook into mp_tournament_restart
	RegServerCmd("mp_tournament_restart", TournamentRestartHook); 
	
	// get the actual snapshot rate
	// the smallest rate can't be bigger than 10 (= 0.1 second)
	// see notes : http://wiki.alliedmods.net/Timers_%28SourceMod_Scripting%29
	//g_snapshotRate = GetConVarInt(FindConVar("tv_snapshotrate"));
}

//----------------------------------------------------------------------------
//| GetPlayersInfo
//|
//| Retrieves all the player's data that is useful for making a map overview :
//| player's name, class, position, angle
//----------------------------------------------------------------------------
public Action:GetPlayersInfo(Handle:timer)
{
	if (mo_bRecordingInfo)
	{
		new bufferlength = maxlength*MaxClients;
		decl String:out_line[maxlength];
		decl String:out_buffer[bufferlength];
		
		// start by creating a new js array
		strcopy(out_buffer, bufferlength, "[");
		
		decl String:name[32];
		new TFClassType:class;
		new team;
		new Float:pos[3];
		new Float:angle[3];
		// then, store players data in a array
		for (new i = 1; i <= MaxClients; i++)
		{
			// we only want to get infos from living players
			if (IsClientInGame(i) && IsPlayerAlive(i))
			{
				GetClientEyePosition(i, pos);
				GetClientEyeAngles(i, angle);
				GetClientName(i, name, 32);
				class = TF2_GetPlayerClass(i);
				team = GetClientTeam(i)-TEAM_OFFSET; 
				
				// format output string
				// 3D-version
				/*Format(out_line, maxlength, "[\"%s\",%d,%d,%d,%d,%d,%d,%d,%d],",
				name,
				team,
				class,
				RoundFloat(pos[0]), RoundFloat(pos[1]), RoundFloat(pos[2]),
				RoundFloat(angle[0]), RoundFloat(angle[1]), RoundFloat(angle[2]));*/
				
				// 2D-version
				Format(out_line, maxlength, "[\"%s\",%d,%d,%d,%d,%d],",
				name,
				team,
				class,
				RoundFloat(pos[0]), RoundFloat(pos[1]), // respectively x and y position
				RoundFloat(angle[1])); // yaw rotation only
				
				// append data to the output buffer
				StrCat(out_buffer, bufferlength, out_line);
			}
		}
		// DEBUG
		//PrintToServer("time %f >>> %s\n", GetGameTime(), out_buffer);

		// remove the last "," from "data"
		new lastCharLoc = strlen(out_buffer)-1;
		out_buffer[lastCharLoc] = '\0';
		// close the frame info
		StrCat(out_buffer, bufferlength, "],");
		
		WriteFileString(mo_hFile, out_buffer, false);
	}
	return Plugin_Continue;
}

//----------------------------------------------------------------------------
//| Event_GameRestart
//|
//| Handles the beginning of a match and moves into the next phase
//| to trigger logging/recording/alltalk events
//----------------------------------------------------------------------------
public Event_GameRestart(Handle:event, const String:name[], bool:dontBroadcast)
{
	mo_bRecordingInfo = true;
	
	// set filename using map and teams name
	new String:mapname[maxlength],
		String:teamRED[maxlength],
		String:teamBLU[maxlength],
		String:time[maxlength],
		String:output[maxlength];
	
	GetCurrentMap(mapname, maxlength);
	GetConVarString(FindConVar("mp_tournament_redteamname"), teamRED, maxlength);
	GetConVarString(FindConVar("mp_tournament_blueteamname"), teamBLU, maxlength);
	FormatTime(time, maxlength, "%d%m%Y-%H%M%S");
	// final formatted string
	Format(output, maxlength, "%s-vs-%s-%s-%s.json",
				teamRED,
				teamBLU,
				mapname,
				time);
	mo_hFile = OpenFile(output, "w");
	strcopy(mo_LatestFileName, maxlength, output);
	
	LogMessage("Recording started : \"%s\"", output);
	
	new String:entryText[maxlength];
	Format(entryText, maxlength, "{\"mapname\":\"%s\",\"snapshotrate\":%d,\"keys\":[\"client\",\"team\",\"class\",\"posx\",\"posx\",\"yaw\"],\"values\":[", mapname, g_snapshotRate);
	WriteFileString(mo_hFile, entryText, false); // Make use of JSONP
	mo_hGetPlayersInfo = CreateTimer(1/float(g_snapshotRate), GetPlayersInfo, _, TIMER_REPEAT);
}

//----------------------------------------------------------------------------
//| TournamentRestartHook
//|
//| reload a new record
//----------------------------------------------------------------------------
public Action:TournamentRestartHook(args)
{
	// if teams aren't ready, we prevent memory leaks by interrupting the last recording
	if (FileExists(mo_LatestFileName))
	{
		ClearTimer(mo_hGetPlayersInfo);
		mo_bRecordingInfo = false;
		CloseHandle(mo_hFile);
		DeleteFile(mo_LatestFileName);
		
		LogMessage("Recording interrupted (RECORDED FILE DELETED !).");
	}
	
	return Plugin_Continue;
}

//----------------------------------------------------------------------------
//| GameOverEvent
//|
//| End of a round for whatever reason
//----------------------------------------------------------------------------
public Event_GameOver(Handle:event, const String:name[], bool:dontBroadcast)
{
	// remove the last "," from "records"
	FileSeek(mo_hFile, -1, SEEK_CUR);
	WriteFileString(mo_hFile, "]}", false);
	
	ClearTimer(mo_hGetPlayersInfo);
	mo_bRecordingInfo = false;
	CloseHandle(mo_hFile);
	LogMessage("Recording ended.");
}