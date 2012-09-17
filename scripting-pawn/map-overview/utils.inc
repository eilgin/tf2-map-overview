 
#if defined _map_overview_included
 #endinput
#endif
#define _map_overview_included

stock ClearTimer(&Handle:timer) 
{ 
    if (timer != INVALID_HANDLE) 
    { 
        // Choose KillTimer instead of CloseHandle. See : http://forums.alliedmods.net/showpost.php?p=986357&postcount=15
		KillTimer(timer); 
    } 
    timer = INVALID_HANDLE; 
}  