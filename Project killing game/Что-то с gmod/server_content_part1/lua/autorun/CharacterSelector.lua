if SERVER then
local files = file.Find ('CharServer/*.lua','LUA')
table.foreach(files,function(key,gui)
include('server/'..gui)
end)
local files = file.Find ('CharClient/*.lua','LUA')
table.foreach(files,function(key,gui)
AddCSLuaFile('client/'..gui)
end)


end


if CLIENT then
local files = file.Find ('CharClient/*.lua','LUA')
table.foreach(files,function(key,gui)
include('client/'..gui)
end)
end
print ('autorun has been кто')
