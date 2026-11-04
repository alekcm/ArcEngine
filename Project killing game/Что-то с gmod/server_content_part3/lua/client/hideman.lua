local singlesos = {true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true}

local function KillNotification(notifname, count)
     if singlesos[count] then
                    singlesos[count] = false
    notification.Kill(notifname)
        timer.Simple(1, function()
                        singlesos[count] = true
                        end)
                    end
    end


local function Draw3DText( pos, ang, scale, text)
--[[    if ( flipView ) then
        -- Flip the angle 180 degrees around the UP axis
        ang:RotateAroundAxis( Vector( 0, 0, 1 ), 180 )
    end--]]

    --[[cam.Start3D2D( pos, ang, scale )
        -- Actually draw the text. Customize this to your liking.
        draw.DrawText( text, "Default", 0, 0, Color( 255, 255, 255, 255 ), TEXT_ALIGN_CENTER )
    cam.End3D2D()--]]
    cam.Start2D()
    pos = pos:ToScreen()
    surface.SetFont( "DermaLarge" )
    surface.SetTextColor( 255, 255, 255 )
    surface.SetTextPos( pos.x,pos.y ) 
    surface.DrawText( text )
    cam.End2D()
end

--[[function ENT:Draw()
    Draw3DText(v:GetPos() + Vector(0,0,100), v:GetAngles(), 0.1, v:Name(), false)
end--]]

hook.Add("PostPlayerDraw", "sostoyanie", function(ply, flag)
    --print(ply:Name())
    --Draw3DText(ply:GetPos()+Vector(0,0,77.5),Angle(0,90,90),1,ply:GetNWString("SosText"))
end)

hook.Add("HUDPaint", "sost2", function()
    for i, v in ipairs( player.GetAll() ) do
        if v:GetNWBool("SosBool") then
            --local pos = v:GetPos()+Vector(0, 0, v:GetModelRadius() + 15)
            --pos = pos:ToScreen()
            if v == LocalPlayer() then
                notification.AddProgress(v:Name(), v:Name()..": "..v:GetNWString("SosText"), 0)
            end
            if (LocalPlayer():GetPos():Distance(v:GetPos()))<v:GetNWFloat("SosCount") then
                local eyetrace = LocalPlayer():GetEyeTrace()
                if eyetrace.Entity == v then
                    --draw.SimpleText(v:GetNWString("SosText"), Default,ScrW()/2,ScrH()/2,Color(255,255,255,255),TEXT_ALIGN_CENTER,TEXT_ALIGN_CENTER)
                end
            end
        end
        if (v:GetNWString("SosText") == nil or v:GetNWString("SosText") == "") then
            KillNotification(v:Name(), i)
        end
    end
end)

local textSize = 10

    for i = 1, 10 do
    surface.CreateFont( "Сondition"..i, {
    font = "Default", --  Use the font-name which is shown to you by your operating system Font Viewer, not the file name
    extended = false,
    size = textSize*3,
    weight = 100,
    blursize = 0,
    scanlines = 0,
    antialias = true,
    underline = false,
    italic = false,
    strikeout = false,
    symbol = false,
    rotary = false,
    shadow = false,
    additive = false,
    outline = false,
} )
   textSize = textSize - 1
    end




hook.Add('PostPlayerDraw', 'Sost3', function(ply)
    if (ply:GetNWBool("SosBool") and ply ~= LocalPlayer() and ply:GetMoveType() == 2)then
        if (LocalPlayer():GetPos():Distance(ply:GetPos()))<ply:GetNWFloat("SosCount") then
            if ply:GetNWString("EngrammaOf") =="" or ply:GetNWString("EngrammaOf") == LocalPlayer():Name() then
    local pos = ply:GetPos() + Vector(0, 0, ply:GetModelRadius() + 15)
    local attachment = ply:GetAttachment(ply:LookupAttachment('eyes'))
    if attachment then
        pos = ply:GetAttachment(ply:LookupAttachment('eyes')).Pos + Vector(0, 0, 10)
    end
    cam.Start2D()
    pos = pos:ToScreen()
    surface.SetFont( "DermaLarge" )
    local TextColor = 255
    local range = ((pos.x - ScrW()/2)^2 + (pos.y - ScrH()/2)^2)^0.5
    local scrRange = (((ScrH()/2)/range)/5)-0.2
    --print(scrRange)
    --[[
    local txtx = math.abs(pos.x - ScrW()/2)
    local txty = math.abs(pos.y - ScrH()/2)
    txtx = (ScrW()/2-txtx)/(ScrW()/2)
    txty = (ScrH()/2-txty)/(ScrH()/2)
    TextColor = 255*txtx*txty
    --]]
    --print(txtx)
    --print(txty*txtx)
    --TextColor = 255*scrRange
    local distance = (ply:GetNWFloat("SosCount")/LocalPlayer():GetPos():Distance(ply:GetPos()))-1
    local PlayersDistance = LocalPlayer():GetPos():Distance(ply:GetPos())
    local textSize = math.floor(PlayersDistance/100 + 1)
    --print("textSize = " .. textSize)
    if ply~=LocalPlayer() then
        --TextColor = TextColor*(ply:GetNWFloat("SosCount")/LocalPlayer():GetPos():Distance(ply:GetPos()))/10
        TextColor = 455*distance*scrRange/5
    end
    --local newColor = Color(255,255,255,TextColor)
    --TextColor = (ply:GetNWFloat("SosCount")/LocalPlayer():GetPos():Distance(ply:GetPos()))*10
    

local color_var = 255
    local computed_color = render.ComputeLighting(ply:GetPos(), Vector(0, 0, 1))
            local max = math.max(computed_color.x, computed_color.y, computed_color.z)
            color_var = math.Clamp(max * 255 * 1.11, 0, 255)
    surface.SetTextColor( 167,252,0,TextColor )
    surface.SetTextPos( pos.x-string.len(ply:GetNWString("SosText"))*4*((10-textSize)/10),pos.y ) 
    --local k = textSize
    --print("k = "..k)
    surface.SetFont("Сondition".. textSize)
    --surface.SetFont("123Сondition")
    surface.DrawText( ply:GetNWString("SosText") )
    --draw.SimpleText(ply:GetNWString("SosText"),"Сondition",pos.x,pos.y,newColor,TEXT_ALIGN_CENTER)
    cam.End2D()
    --print(string.len(ply:GetNWString("SosText")))
end
end
end
end)

--[[hook.Add("Draw", "hideman", function()
for i, v in ipairs( player.GetAll() ) do
    local pos = v:GetPos()
    pos = pos:ToScreen()
    --print(v:GetPos())
    --draw.SimpleText(v:Name(), DermaDefault,pos.x,pos.y,color_white,TEXT_ALIGN_CENTER,TEXT_ALIGN_CENTER)
    
end

end)--]]

hook.Add("FinishMove", "hideman", function (plys, mv)
    for i,ply in ipairs(player.GetAll()) do
        if ply:GetNWString("EngrammaOf") ~= "" and ply:GetNWString("EngrammaOf") ~= LocalPlayer():Name() and ply ~= LocalPlayer() then
            ply:SetMaterial("aaa/empty")
            ply:DrawShadow(false)
            ply:DestroyShadow()
            ply:GetActiveWeapon():SetNoDraw(true)
        else
            ply:SetMaterial(nil)
            ply:DrawShadow(true)
            ply:CreateShadow()
            if ply:GetActiveWeapon():IsValid() then
                ply:GetActiveWeapon():SetNoDraw(false)
            end
        end
    end
end)



--[[hook.Add("Think", "hideman", function ()
	for i, v in ipairs( player.GetAll() ) do
    	if v:Nick() == LocalPlayer():GetNWString("HidedMan") then
    		v:SetMaterial("aaa/empty")
		end
    	if v:GetNWBool("SosBool") then
        	if (LocalPlayer():GetPos():Distance(v:GetPos()))<v:GetNWFloat("SosCount") then
                local eyetrace = LocalPlayer():GetEyeTrace()
                if eyetrace.Entity == v or v == LocalPlayer() then
             		notification.AddProgress(v:Name(), v:Name()..": "..v:GetNWString("SosText"), 0)
                        else
                        KillNotification(v:Name(), i)
                        
                end
        	else
             	KillNotification(v:Name(), i)
        	end
    	else
                KillNotification(v:Name(), i)
    	end
    end
end)--]]
        
        for i, v in ipairs( player.GetAll() ) do
            notification.Kill(v:Name())
            end
print('hideman has been loaded')