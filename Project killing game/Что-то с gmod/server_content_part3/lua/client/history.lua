print('history has been loaded')

local single1 = true
	net.Receive("SendAudio", function()
		if single1 == true then
			local name = net.ReadString()
	surface.PlaySound("audiofiles/"..name ..".mp3")
	single1 = false
	timer.Simple(20, function ()
		single1 = true
		end)
end
end)
local bl = nil
local single2 = true
	net.Receive("SendVideo", function()
		if single1 == true then
			local name = net.ReadString()
			local time = net.ReadFloat()
			if time>10 then
	surface.PlaySound("audiofiles/"..name ..".mp3")
end
	local Black = vgui.Create("DImage")
	bl = Black
	Black:SetSize(ScrW(), ScrH())
	Black:SetImage("materials/sprites/memory/"..name ..".jpg")
	single1 = false
	timer.Simple(time, function ()
		single1 = true
		Black:SetSize(0,0)
		end)
end
end)


net.Receive ("SendLocalMessage", function()
        local Say = net.ReadTable()
        chat.AddText(unpack (Say))
    end)

local loopSound = nil
hook.Add("Think", "Ghost", function()
	for i,ply in ipairs(player.GetAll()) do
		if loopSound ~= nil and ply:Name()=="Ghost face" then
			loopSound:ChangeVolume( 0.8-LocalPlayer():GetPos():Distance(ply:GetPos())/1200 );
			LocalPlayer():ScreenFade( SCREENFADE.OUT, Color( 0, 0, 0, 200), 1, 1 )
		end
	        if(ply:Name()=="Ghost face") and ply~=LocalPlayer() and LocalPlayer():GetPos():Distance(ply:GetPos())<1201  and loopSound == nil then
	        	loopSound = CreateSound( LocalPlayer(), "Kira/"..math.random(1,3)..".wav" );
	        	loopSound:Play()
	        	loopSound:ChangeVolume( 0.8-LocalPlayer():GetPos():Distance(ply:GetPos())/1200 );
	        elseif ply:Name()=="Ghost face" and ply~=LocalPlayer() and LocalPlayer():GetPos():Distance(ply:GetPos())>1200 and loopSound ~=nil then
			loopSound:Stop()
			loopSound = nil
			timer.Simple(1, function ()
	                	LocalPlayer():ScreenFade( SCREENFADE.IN, Color( 0, 0, 0, 3), 1, 0 )
                    	end)
	        end
	        	
        end
end)