local sleep = 0
local ang
local pos
local a
hook.Add("PlayerButtonDown", "SleepUp", function (ply, button)
		if button == 15 then
				if sleep ==1 then
						timer.Simple(2,function()
						ply:ScreenFade( SCREENFADE.PURGE, Color( 0,0,0, 0 ),1,0)
						ply:ScreenFade( SCREENFADE.IN, Color( 0,0,0, 255 ), 0.5, 0 )
				        if(a != nil) then
				            net.Start("RemoveRagdoll")
							net.WriteEntity(a)
				            net.WriteString(LocalPlayer():SteamID())
							net.SendToServer()              
				       	end
						sleep = 0
						end)
				end
			end
end)

net.Receive('SleepNumber', function()
	sleep =1
	a = net.ReadEntity()
end)