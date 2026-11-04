util.AddNetworkString("CsayClient")
util.AddNetworkString("CsayServer")
util.AddNetworkString("NotificationClient")
util.AddNetworkString("NotificationServer")
util.AddNetworkString("BlindClient")
util.AddNetworkString("UnBlindClient")
util.AddNetworkString("BlindServer")
util.AddNetworkString("SlayServer")
util.AddNetworkString("StripServer")
util.AddNetworkString("SetNameServer")
util.AddNetworkString("BringServer")
util.AddNetworkString("NoclipServer")
util.AddNetworkString("UserGroupServer")

local function spiralGrid(rings)
	local grid = {}
	local col, row

	for ring=1, rings do -- For each ring...
		row = ring
		for col=1-ring, ring do -- Walk right across top row
			table.insert( grid, {col, row} )
		end

		col = ring
		for row=ring-1, -ring, -1 do -- Walk down right-most column
			table.insert( grid, {col, row} )
		end

		row = -ring
		for col=ring-1, -ring, -1 do -- Walk left across bottom row
			table.insert( grid, {col, row} )
		end

		col = -ring
		for row=1-ring, ring do -- Walk up left-most column
			table.insert( grid, {col, row} )
		end
	end

	return grid
end
local tpGrid = spiralGrid( 24 )

net.Receive("CsayServer", function()
	local msg = net.ReadString()
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		net.Start("CsayClient")
		net.WriteString(msg)
		net.Send(ply)
	end
end)

net.Receive("NotificationServer", function()
	local msg = net.ReadString()
	local idNotifty = net.ReadInt(6)
	local tablePlayers = net.ReadTable()
	local time = net.ReadUInt(32)
	for i,ply in ipairs(tablePlayers) do
		net.Start("NotificationClient")
		net.WriteString(msg)
		net.WriteInt(idNotifty,6)
		net.WriteUInt(time, 32)
		net.Send(ply)
	end
end)

net.Receive("BlindServer", function()
	local idBlind = net.ReadInt(3)
	local nameNet
	if (idBlind == 1) then
		nameNet = "BlindClient"
	else
		nameNet = "UnBlindClient"
	end
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		net.Start(nameNet)
		net.Send(ply)
	end
end)

net.Receive("SlayServer", function()
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		if (ply:Alive()) then
			ply:Kill()
		end
	end
end)

net.Receive("StripServer", function()
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		ply:StripWeapons()
	end
end)

net.Receive("SetNameServer", function()
	local name = net.ReadString()
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		ply:SetNWString("PlayerName",name)
	end
end)

net.Receive("BringServer", function(len,ply)
	local cell_size = 50
	local teleport = ply
	local tplys = {}
	local tablePlayers = net.ReadTable()
	for i,plyV in ipairs(tablePlayers) do
		local c = tpGrid[i][1]
		local r = tpGrid[i][2]

		local yawForward = teleport:EyeAngles().yaw
		local offset = Vector( r * cell_size, c * cell_size, 0 )
		offset:Rotate( Angle( 0, yawForward, 0 ) )

		local t = {}
		t.start = teleport:GetPos() + Vector( 0, 0, 32 )
		t.filter = players_involved
		t.endpos = t.start + offset

		if plyV:IsVehicle() then
			target:ExitVehicle()
		end
		plyV:SetPos( t.endpos )
      	plyV:SetLocalVelocity( Vector( 0, 0, 0 ) )
      	table.insert( tplys, plyV )
	end
end)

net.Receive("NoclipServer", function(len,ply)
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		if (ply:GetMoveType() == MOVETYPE_NOCLIP) then
			ply:SetMoveType(MOVETYPE_WALK)
	    else
	    	ply:SetMoveType(MOVETYPE_NOCLIP)
	    end
	end
end)

net.Receive("UserGroupServer", function(len,ply)
	local group = net.ReadString()
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		ply:SetUserGroup(group)
	end
end)

print("QuickMonomenuServer saved")