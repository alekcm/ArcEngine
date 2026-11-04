GM = GM or GAMEMODE
local microicon = Material("sprites/ui/time/micro.png")
local deathicon = Material("sprites/ui/time/death.png")
local function iconfunc()
    surface.SetDrawColor(255, 255, 255)
    --surface.SetMaterial(microicon)
    local Distance = LocalPlayer():GetNWFloat("VoiceDistance")
    if Distance == 0 or Distance == 100 or Distance == 250 or Distance == 650 or Distance == 1200 or Distance == 10000 then
        surface.SetMaterial(Material("sprites/ui/time/micro"..LocalPlayer():GetNWFloat("VoiceDistance")..".png"))
        else
        surface.SetMaterial(Material("sprites/ui/time/micro.png"))
        end
    if Distance<10000 then
    surface.DrawTexturedRect(ScrW()/2-25, ScrH()-150, 50, 150)
    else
    surface.DrawTexturedRect(ScrW()/2-45, ScrH()-150, 80, 150)
    end
end
local function deathfunc()
    surface.SetDrawColor(255, 255, 255, 200)
    surface.SetMaterial(deathicon)
    surface.DrawTexturedRect(0, 0, ScrW(), ScrH())
end

hook.Add("PlayerStartVoice", "ImageOnVoice", function(ply)
        if ply == LocalPlayer() then
    hook.Add("HUDPaint", "ImageOnVoice", iconfunc)
            end
end)

hook.Add("PlayerEndVoice", "ImageOnVoice", function(ply)
        if ply == LocalPlayer() then
    hook.Remove("HUDPaint", "ImageOnVoice")
            end
end)





net.Receive("DieOnDDF", function ()
hook.Add("HUDPaint", "ImageOnDeath", deathfunc)
        hook.Remove("HUDPaint", "ImageOnTime")
    end)

local IsAltPressed = false
hook.Add("PlayerButtonUp", "VoicePanelClientUp", function (ply, button)
        
        if button == 81 then
            IsAltPressed = false
            end
        
        
end)

local FogSize = 0
local ourMat = Material( "vgui/white" )
hook.Add( "PostDrawTranslucentRenderables", "Boxxie", function()
if FogSize ~=0 then

    render.SetColorMaterial()
    local pos = LocalPlayer():GetPos()
    local clr = Color(0,0,0,1)
    if FogSize == 100 then
        clr = Color(0,0,255,1)
    elseif FogSize == 250 then
        clr = Color(255,255,255,1)
        elseif FogSize == 650 then
            clr = Color(255,162,0,1)
            elseif FogSize == 1200 then
                clr = Color(255,0,0,1)
            end

    for i = 1, 20 do
        render.DrawBox( pos, Angle(0,5*i,0), Vector(FogSize*1.5,FogSize*1.5,0), Vector(-FogSize,-FogSize,5), clr )
    end
    --render.DrawWireframeSphere( pos, 30, 100, 3, Color( 255, 255, 255, 255 ) )
end
    -- Draw the sphere!
    --render.DrawSphere( pos, radius, wideSteps, tallSteps, Color( 0, 175, 175, 100 ) )

    -- Draw the wireframe sphere!
    --render.DrawWireframeSphere( pos, radius, wideSteps, tallSteps, Color( 255, 255, 255, 100 ) )
--[[    local pos = LocalPlayer():GetPos() -- position to render box at

    render.SetColorMaterial() -- white material for easy coloring

    --cam.IgnoreZ( true ) -- makes next draw calls ignore depth and draw on top
    render.DrawSphere( pos, FogSize,50,50, Color(255,255,255,255)) -- draws the box 
    --cam.IgnoreZ( false ) -- disables previous call--]]

        --render.SetColorMaterial()
       -- render.SetMaterial( ourMat )
    -- The position to render the sphere at, in this case, the looking position of the local player
    --local pos = LocalPlayer():GetPos()
--render.DrawQuad( Vector( 0, 0, -150 ), Vector( 0, 100, -150 ),Vector( 100, 100, -150 ), Vector( 100, 0, -150 ), Color( 255, 0, 0, 128 ) )
    --render.DrawQuad(pos + Vector(10,10,10),pos + Vector(-10,10,10),pos + Vector(-10,-10,-10),pos + Vector(10,-10,-10), Color(255,255,255,100))
    -- Draw the sphere!
    --render.DrawSphere( pos, 50, 30, 30, Color( 0, 175, 175, 100 ) )
end )

--[[hook.Add("SetupSKyboxFog", "SetFog", function()
    --print("hi")
    render.FogStart(FogSize)

             render.FogColor(255,255,255)
             render.FogEnd(FogSize*1.25)
             render.FogMode( 1 )
             render.FogMaxDensity( 0.5)
             render.SetFogZ( 200 )
            --return true

end)--]]

--hook.Add( "PostDrawEffects", "DrawSayDistance", function()
--[[
    cam.Start3D2D(LocalPlayer():GetPos(),LocalPlayer():GetAngles(), 0.1)

    
    surface.DrawCircle(0,0, FogSize, 255,255,255,255)

    --surface.DrawCircle( 500, 500, 100 + math.sin( CurTime() ) * 50, Color( 255, 120, 0 ) )

    cam.End3D2D()--]]

   --[[ cam.Start3D2D(LocalPlayer():GetPos()+Vector(0,0,-40),LocalPlayer():GetAngles(), 0.1)
        --if(!isstring(mat[self])) then
            surface.SetMaterial(Material("talkicon1/voice1.png"))
        --end
                surface.SetDrawColor(Color(255,255,255,255))
surface.DrawTexturedRect(0-700/2, -700+110, 700, 700)
cam.End3D2D()

end )--]]

--[[hook.Add("HUDPaint", "Names", function()
             
        --if FogSize ~= 0 then
           -- timer.Simple(3, function ()
             --   FogSize = 20
           -- end)
        --end
        end)--]]

local single8 = true

hook.Add("PlayerButtonUp", "VoicePanelClientDown", function (ply, button)
   if 2 <= button and button <=5 then
    FogSize = 0
   end
end)

hook.Add("PlayerButtonDown", "VoicePanelClientDown", function (ply, button)
            if button == 81 then
            IsAltPressed = true
            end
        
            if single8 == true then
           
            if button == 2 and IsAltPressed == true then
                 single8 = false
            --LocalPlayer():SetNWFloat("VoiceDistance", 310)
            notification.AddLegacy( "Вы шепчете", NOTIFY_GENERIC, 5 )
                surface.PlaySound( "buttons/button7.wav" )
            net.Start("ChangeVoiceLenght2")
            net.SendToServer()
            net.Start("ChangeVoiceLenght")
            net.WriteFloat(100)
            net.SendToServer()
            FogSize = 100
            end
        if button == 3 and IsAltPressed == true then
                single8 = false
            --LocalPlayer():SetNWFloat("VoiceDistance", 620)
            notification.AddLegacy( "Вы говорите", NOTIFY_GENERIC, 5 )
                surface.PlaySound( "buttons/button7.wav" )
            net.Start("ChangeVoiceLenght2")
            net.SendToServer()
            net.Start("ChangeVoiceLenght")
            net.WriteFloat(250)
            net.SendToServer()
            FogSize = 250
            end
        if button == 4 and IsAltPressed == true then
                single8 = false
            --LocalPlayer():SetNWFloat("VoiceDistance", 620)
            notification.AddLegacy( "Вы повысили голос", NOTIFY_GENERIC, 5 )
                surface.PlaySound( "buttons/button7.wav" )
            net.Start("ChangeVoiceLenght2")
            net.SendToServer()
            net.Start("ChangeVoiceLenght")
            net.WriteFloat(650)
            net.SendToServer()
            FogSize = 650
            end
        if button == 5 and IsAltPressed == true then
                single8 = false
            --LocalPlayer():SetNWFloat("VoiceDistance", 930)
            notification.AddLegacy( "Вы кричите", NOTIFY_GENERIC, 5 )
                surface.PlaySound( "buttons/button7.wav" )
            net.Start("ChangeVoiceLenght2")
            net.SendToServer()
            net.Start("ChangeVoiceLenght")
            net.WriteFloat(1200)
            net.SendToServer()
            FogSize = 1200
            end
        if button == 6 and IsAltPressed == true and ply:IsSuperAdmin() then
                single8 = false
            --LocalPlayer():SetNWFloat("VoiceDistance", 930)
            notification.AddLegacy( "Вы используете громкоговоритель", NOTIFY_GENERIC, 5 )
                surface.PlaySound( "buttons/button7.wav" )
            net.Start("ChangeVoiceLenght2")
            net.SendToServer()
            net.Start("ChangeVoiceLenght")
            net.WriteFloat(10000)
            net.SendToServer()
            end
            timer.Simple(0.1, function()
                    single8 = true
                    end)
        end
        if button == 7 and IsAltPressed == true then
                single8 = false
            --LocalPlayer():SetNWFloat("VoiceDistance", 930)
            notification.AddLegacy( "Внутренний голос", NOTIFY_GENERIC, 5 )
                surface.PlaySound( "buttons/button7.wav" )
            net.Start("ChangeVoiceLenght2")
            net.SendToServer()
            net.Start("ChangeVoiceLenght")
            net.WriteFloat(0)
            net.SendToServer()
            FogSize = 0
        end

        if button == 1 and IsAltPressed == true and LocalPlayer():Nick() == "Кируми Тоджо" then
            single8 = false
            sound.PlayFile( "sound/"..math.random(1,7)..".aac", "", function( channel )
            channel:Play()
            channel:SetVolume( 10 )
            _chanel = channel
            end)
        end
end)

print ('VoicePanel has been autoruned')