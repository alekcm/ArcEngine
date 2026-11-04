local _dframe = nil
local _dhtml = nil
local _chanel = nil

local musicLenght = {{["freetime"] = {98,283,249,113,85,116,326,294,68,280,227,150,178},["debate"] = {210,180,197,257,233,354,246,197,138,249,208,186,333,201,261}}}
musicLenght[1]["execution"] = {214,90}
musicLenght[1]["finalargument"] = {900}
musicLenght[1]["glass"] = {222,157,268}
musicLenght[1]["investigation"] = {1802}
musicLenght[1]["monokumachill"] = {234,199,225,159,202,262,114}
musicLenght[1]["monokumahard"] = {1802}
musicLenght[1]["panick"] = {900}
musicLenght[1]["partend"] = {127,136}
musicLenght[1]["rebuttal"] = {522,284,136,270,243,172}
musicLenght[1]["scrum"] = {900}
musicLenght[1]["suspens"] = {103,267,181,356,176,99,77,368,164}
musicLenght[1]["waittrial"] = {82}
musicLenght[1]["discussion"] = {100,104,90,172,90,100,93,100,89,92,95,90,90,95,77,90,90}
musicLenght[1]["chronobox"] = {72,98,90,94,93,108,95,151}
musicLenght[1]["chronoboxhard"] = {149,134,165,93,96,108,95,99}
musicLenght[1]["umineko1"] = {280}
musicLenght[1]["umineko2"] = {282}
musicLenght[1]["uminekohard"] = {243,422,281,181,255,206,277}
musicLenght[1]["uminekohistorical"] = {195,350,121}

musicLenght[1]["debat"] = {285,323,289,320,280,169,168,159,249,165,134,236,319,165,120}
musicLenght[1]["fritime"] = {186,146,172,144,331,261,169,258,333,248,189,136,181,227,144,117,117,117,344,108,}
musicLenght[1]["mastermindchill"] = {204,262,305,210,149}
musicLenght[1]["mastermindhard"] = {292,260}
musicLenght[1]["obsujdenie"] = {132,204,206,194,197,116,126,188,135,116,149,127,173,155,124}
musicLenght[1]["ojidaniesuda"] = {74,132}
musicLenght[1]["panika"] = {180,207,194,144,541,286,293,137}
musicLenght[1]["rassledovanie"] = {302,132,127,137}
musicLenght[1]["saspens"] = {163,180,96,149,115,149,125,120}
musicLenght[1]["steklo"] = {270,282,118,211}

local volumeScaler = 0.025
local changeVolumeScaler = 0.2/volumeScaler

local globalSongType = ""

local settingsFrame = nil
local dhtml = nil



function closeSettings()
    settingsFrame:SetPos(ScrW(), ScrH())
    settingsFrame:KillFocus()
    settingsFrame:SetPopupStayAtBack(true)
    settingsFrame:SetMouseInputEnabled(false)
    settingsFrame:SetKeyboardInputEnabled(false)
end




local function OpenAll()
settingsFrame = vgui.Create("DFrame")
settingsFrame:ShowCloseButton(false)
settingsFrame:SetSize( 210  ,60 )
settingsFrame:SetTitle( "Radio" )
settingsFrame:SetPos(ScrW(), ScrH())
dhtml = vgui.Create( 'DHTML', settingsFrame)
dhtml:SetSize( ScrW()/2, ScrH()/2 )
dhtml:SetPos(0,60)
--dhtml:OpenURL("https://youtu.be/mnKSCgUW1b0")
local dTextEntry = vgui.Create( 'DTextEntry', settingsFrame)
dTextEntry:SetText(volumeScaler)
dTextEntry:SetSize(100,20)
dTextEntry:SetPos(0, 20)
local button = vgui.Create( 'DButton', settingsFrame)
button:SetSize(100,20)
button:SetText("Сохранить")
button:SetPos(110, 20)
button.DoClick = function()
volumeScaler = dTextEntry:GetText()
changeVolumeScaler = 0.2/volumeScaler
if _chanel ~= nil then
    _chanel:SetVolume( volumeScaler )
    end
end
local button2 = vgui.Create( 'DButton', settingsFrame)
button2:SetSize(200,20)
button2:SetText("Закрыть")
button2:SetPos(00, 40)
button2.DoClick = function()
closeSettings()
end
end

net.Receive("SendSongToClient2", function()
        if settingsFrame == nil then
        OpenAll()
    end
local html = net.ReadString()
dhtml:OpenURL( html )
settingsFrame:SetSize( ScrW()/2, ScrH()/2+60 )

end)


function openSettings()
    if settingsFrame == nil then
        OpenAll()
    end
    settingsFrame:Center()
    settingsFrame:MakePopup()
    --settingsFrame:KillFocus()
end




local function EndMusic()
    timer.Remove("StartRadioMusic")
    if _chanel ~= nil then
        for i = 1, 25 do
            timer.Simple(i/10,function()
                _chanel:SetVolume( volumeScaler - i/(125*changeVolumeScaler) )
            end)
        end
        timer.Simple(2.6, function ( )
                    _chanel = nil
        end)
    end

end

local randoms = {}
local prevrandnum = nil
local function StartSong(SongType)
    if settingsFrame == nil then
        OpenAll()
    end
    local sin = true
    local rand
    local musfiles, directories = file.Find( "sound/newmusic/"..SongType.."/*", "WORKSHOP" )
        rand = math.random(1,#musfiles)
    if #musfiles > 1 then
    if rand == prevrandnum then
        if rand == #musfiles then
            rand = rand - 1
            else 
            rand = rand +1
            end
        end
        end
    prevrandnum = rand
    local musLength = nil
    sound.PlayFile( "sound/newmusic/"..SongType.."/"..rand..".mp3", "", function( channel )
        channel:Play()
        channel:SetVolume( volumeScaler )
        _chanel = channel
        timer.Create("StartRadioMusic",_chanel:GetLength(),1,function()
            if globalSongType == SongType then
                StartSong(SongType)
            end
        end)
    end)
end

--timer.Remove("StartRadioMusic")

--StartSong("freetime")




--[[net.Receive("SendSongToClient", function()
    if _dframe ~= nil then
        _dframe:Remove()
    end
local url = net.ReadString()

sound.PlayURL( url, "mono", function () 
    if ( IsValid( station ) ) then

        station:SetPos( LocalPlayer():GetPos() )
        
        station:Play()
        else

        LocalPlayer():ChatPrint( "Invalid URL!" )
    end

end)

end)--]]

net.Receive("SendSongToClient",function()
    randoms = {}
    globalSongType = net.ReadString()
    if _chanel ~= nil then
        EndMusic()
        timer.Simple(2.6,function()
            StartSong(globalSongType)
        end)
    else
        StartSong(globalSongType)
    end
end)

net.Receive("StopSong2", function()
    --_dhtml:QueueJavascript( "player.pauseVideo();" )
    if settingsFrame ~= nil then
settingsFrame:Remove()
OpenAll()
end
    if _chanel ~= nil then
        EndMusic()
    end
end)
net.Receive("StartSong2", function()
    --_dhtml:QueueJavascript( "player.playVideo();" )
end)

print("radio started")