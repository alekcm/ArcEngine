AddCSLuaFile()
if SERVER then
	print("Hide names script by le0nid0s loaded.")
	local l_scriptEnabled = true

	function hereGoesANewPlayer(ply)
		if(l_scriptEnabled)then
			ply:SendLua("function GAMEMODE:HUDDrawTargetID() return false end RunConsoleCommand('hud_deathnotice_time', '0')")
		end
	end

	function toggleHideNames(player)
		if(player:IsSuperAdmin())then
			if(l_scriptEnabled)then
				PrintMessage(HUD_PRINTTALK, "Names are shown")
			else
				PrintMessage(HUD_PRINTTALK, "Names are hidden")
			end
			l_scriptEnabled = !l_scriptEnabled
			umsg.Start("toggleHideNamesScript")
			umsg.Bool(l_scriptEnabled)
			umsg.End()
		end
	end

	concommand.Add("toggleHideNames",toggleHideNames)
	hook.Add("PlayerInitialSpawn", "Hides names", hereGoesANewPlayer)
end

if CLIENT then
	usermessage.Hook( "toggleHideNamesScript", function(data) //toggleHideNamesClient)local function toggleHideNamesClient(data)
		if(!data:ReadBool()) then
			function GAMEMODE:HUDDrawTargetID()
				local tr = util.GetPlayerTrace( LocalPlayer() )
				local trace = util.TraceLine( tr )
				if (!trace.Hit) then return end
				if (!trace.HitNonWorld) then return end
					
				local text = "ERROR"
				local font = "TargetID"
					
				if (trace.Entity:IsPlayer()) then
					text = trace.Entity:Nick()
				else
					return
						--text = trace.Entity:GetClass()
				end
					
				surface.SetFont( font )
				local w, h = surface.GetTextSize( text )
					
				local MouseX, MouseY = gui.MousePos()
					
				if ( MouseX == 0 && MouseY == 0 ) then
					MouseX = ScrW() / 2
					MouseY = ScrH() / 2
				end
					
				local x = MouseX
				local y = MouseY
					
				x = x - w / 2
				y = y + 30
					
				-- The fonts internal drop shadow looks lousy with AA on
				draw.SimpleText( text, font, x+1, y+1, Color(0,0,0,120) )
				draw.SimpleText( text, font, x+2, y+2, Color(0,0,0,50) )
				draw.SimpleText( text, font, x, y, self:GetTeamColor( trace.Entity ) )
					
				y = y + h + 5
					
				local text = trace.Entity:Health() .. "%"
				local font = "TargetIDSmall"
					
				surface.SetFont( font )
				local w, h = surface.GetTextSize( text )
				local x =  MouseX  - w / 2
					
				draw.SimpleText( text, font, x+1, y+1, Color(0,0,0,120) )
				draw.SimpleText( text, font, x+2, y+2, Color(0,0,0,50) )
				draw.SimpleText( text, font, x, y, self:GetTeamColor( trace.Entity ) )
			end
			RunConsoleCommand('hud_deathnotice_time', '6')
		else
			function GAMEMODE:HUDDrawTargetID()
				return false
			end 
			RunConsoleCommand('hud_deathnotice_time', '0')
		end
	end)
end