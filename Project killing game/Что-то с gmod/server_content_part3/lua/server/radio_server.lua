util.AddNetworkString("SendSongToServer")
util.AddNetworkString("SendSongToClient")
util.AddNetworkString("SendSongToClient2")
util.AddNetworkString("StopSong1")
util.AddNetworkString("StopSong2")
util.AddNetworkString("StartSong1")
util.AddNetworkString("StartSong2")
util.AddNetworkString("StartChosenSong")
util.AddNetworkString("autoRadio")

autoRadio = false
local currentSong = nil
hook.Add( "PlayerInitialSpawn", "FullLoadSetup", function( ply )
	if currentSong ~= nil then
            timer.Simple(10,function()
             net.Start("SendSongToClient")
    net.WriteString(currentSong)
    net.Send(ply)
                    end)
            end
end )
net.Receive("SendSongToServer", function (  )
    local html = net.ReadString()
    net.Start("SendSongToClient2")
    net.WriteString(html)
    net.Broadcast()
end)
net.Receive("StartChosenSong", function (  )
    local tbl = net.ReadTable()
    local plyName = tbl[1]
    local currentSong = tbl[2]
    print(plyName)
    if plyName == "All players" then
        net.Start("SendSongToClient")
        net.WriteString(currentSong)
        net.Broadcast()
    else
        local ply
        for k,v in ipairs(player.GetAll()) do
            if (plyName == v:SteamID()) then
                ply = v
            end
        end
        net.Start("SendSongToClient")
        net.WriteString(currentSong)
        net.Send(ply)
    end
end)
net.Receive("autoRadio", function (  )
    autoRadio = net.ReadBool()
end)
net.Receive("StopSong1", function (  )
         currentSong = nil
    net.Start("StopSong2")
    net.Broadcast()
end)
net.Receive("StartSong1", function (  )
    net.Start("StartSong2")
    net.Broadcast()
end)

print("radio_server loaded")