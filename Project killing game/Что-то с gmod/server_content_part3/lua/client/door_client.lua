local StationTable = {}
local StationPosRot = {{},{}}
    local single1 = true


net.Receive("SendStationName", function ()
    local single = true
    if single1 then
        single1 = false
        timer.Simple(1, function ()
            single1 = true
            end)
    local name = net.ReadString()
    local posrot = net.ReadTable()
         for i=1,table.Count(StationTable) do
                        if StationTable[i] == name then
                            single = false
                        end
                    end       
    if single then
        table.insert(StationTable, name)
        if table.Count(StationTable) == 5 then
  net.Start("GetAchiv2")
  net.WriteFloat(1)
  net.WriteEntity(LocalPlayer())
  net.SendToServer()
        end
        StationPosRot[1][table.Count(StationTable)] = posrot[1]
        StationPosRot[2][table.Count(StationTable)] = posrot[2]
    end    
    local DFrame = vgui.Create("DFrame")
    DFrame:SetSize(200,30*table.Count(StationTable)+20)
    DFrame:Center()
    DFrame:MakePopup()
    DFrame:SetTitle("Куда отправимся?")
    for i = 1,table.Count(StationTable) do
        local DButton = vgui.Create("DButton",DFrame)
        DButton:SetSize(200,30)
        DButton:SetPos(0,30*i - 10)
        DButton:SetText(StationTable[i])
        DButton.DoClick = function()
        net.Start("SendStationName2")
        net.WriteTable({StationPosRot[1][i],StationPosRot[2][i],LocalPlayer()})
        net.SendToServer()
        DFrame:Close()
    end
    end
end
end)

net.Receive("GetAchiv", function ()
  local num = net.ReadFloat()
  local ply = net.ReadEntity()
  net.Start("GetAchiv2")
  net.WriteFloat(num)
  net.WriteEntity(ply)
  net.SendToServer()
  end)

local single2 = true
local _NFrame = nil
hook.Add("PlayerButtonDown", "48Client", function (ply, button)
    if button == 48 and LocalPlayer():IsSuperAdmin() then 
        if single2 == true then
            if _NFrame ~= nil then 
            _NFrame:Remove()
        end
local NFrame = vgui.Create("DFrame")
_NFrame = NFrame
NFrame:SetPos(ScrW()*3/8,ScrH()*4/9)
NFrame:MakePopup()
NFrame:SetTitle("Имя человека")
NFrame:SetSize(500,115)
local NTextEntry = vgui.Create("DTextEntry", NFrame)
NTextEntry:SetPos(5, 25)
NTextEntry:SetSize(490, 20)
local SFrame = vgui.Create("DLabel",NFrame)
SFrame:SetText("Название достижения")
SFrame:SetPos(7, 48)
SFrame:SetSize(490,10)
local STextEntry = vgui.Create("DTextEntry", NFrame)
STextEntry:SetPos(5, 65)
STextEntry:SetSize(490, 20)
local NButton = vgui.Create("DButton", NFrame)
NButton:SetText("Отправить")
NButton:SetPos(5, 90)
NButton:SetSize(490, 20)
NButton.DoClick = function()
  net.Start("GetAchiv3")
  net.WriteTable({NTextEntry:GetText(),STextEntry:GetText()})
  net.SendToServer()
  NFrame:Remove()
end
        single2 = false
        timer.Simple(0.1, function ()
            single2 = true
        end)
        end
    end
        end)

print('door client has been loaded')




