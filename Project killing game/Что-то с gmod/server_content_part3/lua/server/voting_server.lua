print('voting server has been loaded')

util.AddNetworkString("ChangeCharList")
util.AddNetworkString("ChangeCharList2")
util.AddNetworkString("ChangeCharList3")
util.AddNetworkString("ChangeCharList4")
util.AddNetworkString("StartVoting")
util.AddNetworkString("StartVoting2")
util.AddNetworkString("EndOfChapter")
util.AddNetworkString("EndOfChapter2")
util.AddNetworkString("EndOfGame")
util.AddNetworkString("EndOfGame2")
util.AddNetworkString("SendVote")
util.AddNetworkString("ShowResults")
util.AddNetworkString("StartInvestigating")
util.AddNetworkString("StartInvestigating1")
util.AddNetworkString("StartInvestigating2")
util.AddNetworkString("StartExecution")
util.AddNetworkString("TurnNamesOn")
util.AddNetworkString("TurnNamesOff")
util.AddNetworkString("TurnNamesOn2")
util.AddNetworkString("TurnNamesOff2")
util.AddNetworkString("TurnFlyOn")
util.AddNetworkString("TurnFlyOff")
util.AddNetworkString("TurnFlyOn2")
util.AddNetworkString("TurnFlyOff2")
util.AddNetworkString("TurnSingleNameOn")
util.AddNetworkString("TurnSingleNameOff")
util.AddNetworkString("TurnSingleNameOn2")
util.AddNetworkString("TurnSingleNameOff2")
util.AddNetworkString("TurnHideOn")
util.AddNetworkString("TurnHideOff")

util.AddNetworkString("SendLocalMessage")

CurrentPlayers = {{"Akane","Aoi","Celestia","Byakuya","Toko","Imposter","Kaede","Hajime","Maki","Kaito","Rantaro","Kazuichi","Shuichi","Makoto","Nagito","Fuyuhiko"},{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true},{false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false},{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},{false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false}}

net.Receive("TurnNamesOn", function()
        local name = net.ReadString()
        net.Start("TurnNamesOn2")
        net.WriteString(name)
        net.Broadcast()
    end)
net.Receive("TurnNamesOff", function()
        local name = net.ReadString()
        net.Start("TurnNamesOff2")
        net.WriteString(name)
        net.Broadcast()
    end)

net.Receive("TurnHideOn", function()
        local table = net.ReadTable()
        for i, v in ipairs( player.GetAll() ) do
    if( v:Nick() == table[1] )then
        v:SetNWString("HidedMan", table[2])
    end
    end
    end)
net.Receive("TurnHideOff", function()
        local table = net.ReadTable()
        for i, v in ipairs( player.GetAll() ) do
    if( v:Nick() == table[1] )then
        v:SetNWString("HidedMan", "")
    end
    end
    end)

net.Receive("TurnSingleNamesOn", function()
        local table = net.ReadTable()
        table[1]:SetNWString("NameForSee", table[2])
    end)
net.Receive("TurnSingleNamesOff", function()
        local table = net.ReadTable()
        table[1]:SetNWString("NameForSee", "")
    end)

net.Receive("TurnFlyOn", function()
        local name = net.ReadString()
        for i, v in ipairs( player.GetAll() ) do
    if( v:Nick() == name )then
                name:SetNWBool("CanFly", true)
                end
end
    end)
net.Receive("TurnFlyOff", function()
        local name = net.ReadString()
        for i, v in ipairs( player.GetAll() ) do
    if( v:Nick() == name )then
                name:SetNWBool("CanFly", false)
                end
end
    end)
hook.Add( "PlayerNoClip", "CanFlyOnRyuGame", function( ply, desiredNoClipState )
    --if ( !ply:IsSuperAdmin() and !ply:IsAdmin()) then
            if ply:GetNWBool("CanFly") == true then -- the player wants to turn noclip off
        return true -- always allow
    end
           -- end
end )


net.Receive("EndOfChapter", function ()
        timer.Simple(4, function()
Chapter = tostring(tonumber(Chapter) + 1)
	net.Start("StartFreetime")
	net.Broadcast()
                end)
    net.Start("EndOfChapter2")
    net.WriteTable(CurrentPlayers)
	net.WriteBool(net.ReadBool())
    net.Broadcast()
    net.Start("CleanEvidences")
	net.Broadcast()
    timer.Simple(2, function ()
    net.Start("CanBeHungryOrNot2")
    net.WriteBool(CanBeHungry)
    net.Broadcast()
    end)
	for i, v in ipairs( ents.GetAll() ) do
		if(v:GetClass()=="evidence") then
			v:Remove();
		end
	end
    end)

net.Receive("SendVote", function()
        local ply = net.ReadEntity()
        local i = net.ReadFloat()
        CurrentPlayers[4][i] = CurrentPlayers[4][i] + 1
        print("Игрок "..ply:Name().." проголосовал за "..CurrentPlayers[1][i])
    end)
net.Receive("ChangeCharList", function (len, ply)
    net.Start("ChangeCharList2")
    net.WriteTable(CurrentPlayers)
    net.Send(ply)
    end)
net.Receive("ChangeCharList3", function (len, ply)
    net.Start("ChangeCharList4")
    net.WriteTable(CurrentPlayers)
    net.Send(ply)
    end)
net.Receive("StartInvestigating", function (len, ply)
    net.Start("CanBeHungryOrNot2")
    net.WriteBool(false)
    net.Broadcast()
    net.Start("StartInvestigating1")
    net.Broadcast()
    Time = "Investigation"
    net.Start("StartInvestigating2")
    net.Broadcast()
    net.Start("StartDraw")
    net.Broadcast()
    end)

function StartVotingDDF()
    net.Start("StartVoting2")
    net.WriteTable(CurrentPlayers)
    net.Broadcast()
    local nameVotes = {}
    local valueVotes = {}
    --for i = 1,16 do
       -- CurrentPlayers[4][i] = 0
       -- end
        timer.Simple(20, function()
                local max = 0
                local voted = "Empty"
                for i = 1,16 do
                    if CurrentPlayers[4][i]>0 then
                        table.insert( nameVotes, CurrentPlayers[1][i] )
                        table.insert( valueVotes, CurrentPlayers[4][i] )
                    end
                    if CurrentPlayers[4][i] > max then
                        max = CurrentPlayers[4][i]
                        voted = CurrentPlayers[1][i]
                        end
                    CurrentPlayers[4][i] = 0
                    end
            net.Start("ShowResults")
                net.WriteString(voted)
                net.Broadcast()
                Time = "Execution"
                net.Start("StartExecution")
                net.Broadcast()
                for i,ply1 in pairs(player.GetAll()) do
    ply1:Freeze(false)
ply1:SetAvoidPlayers(false)
    ply1:SetCanZoom(true)
    ply1:DrawViewModel(true)
ply1:DrawWorldModel(true)
VisiableTrial(ply1)
ply1:SetViewEntity(ply1)

end
for i,p in pairs(nameVotes) do
                    local Say = {}
                        table.Add(Say, {Color(255, 0, 0), p} )
                        table.Add(Say, {Color(255,255,255), " - "..valueVotes[i].." голос(ов)"} )
                        for k, v in ipairs( player.GetAll() ) do
                            net.Start("SendLocalMessage")
                            net.WriteTable(Say)
                            net.Send(v)
                        end
                end
    net.Start("EndDraw")
    net.Broadcast()
    --StartVotingDDF()
    Time = "Execution"
        net.Start("EndTrialDDF")
                net.Broadcast()
net.Start("HideTables2")
net.Broadcast()
                end)
end

net.Receive("StartVoting", function (len, ply)
    StartVotingDDF()
    end)


net.Receive("SendCharList", function ()
    CurrentPlayers = net.ReadTable()
    end)
