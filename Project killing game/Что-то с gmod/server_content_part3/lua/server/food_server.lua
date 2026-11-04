util.AddNetworkString("PlayerSpawnedAndHeWantEat")
util.AddNetworkString("Sleep_Stand")

hook.Add("PlayerInitialSpawn", "FirstFoodJoin", function (ply)
    net.Start("PlayerSpawnedAndHeWantEat")
	net.Send(ply)
	end)

hook.Add("PlayerDeathSound", "MustPlayerBeDead", function (ply)
	return true
	end)

net.Receive("Sleep_Stand",function(len,ply)
	if(net.ReadBool()) then
		net.Start("EndSleep")
		net.Send(ply)
	else
		net.Start("StartSleep")
		net.Send(ply)
	end
end)
print('server food has been loaded')

for i, v in ipairs( ents.GetAll() ) do
	print(v:GetClass())
end