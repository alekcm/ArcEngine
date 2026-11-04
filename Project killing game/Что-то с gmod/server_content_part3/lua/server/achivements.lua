util.AddNetworkString("SetSos")
util.AddNetworkString("DelSos")


net.Receive("SetSos", function ()
local ply = net.ReadEntity()
local text = net.ReadString()
local count = net.ReadFloat()
        ply:SetNWString("SosText", text)
        ply:SetNWFloat("SosCount",count)
        ply:SetNWBool("SosBool",true)
  end)
net.Receive("DelSos", function ()
        local ply = net.ReadEntity()
        ply:SetNWString("SosText", "")
        ply:SetNWBool("SosBool",false)
  end)

print("achivements saved")