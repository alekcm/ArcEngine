local alphabet = {"А", "Б", "В", "Г", "Д", "Е", "Ё", "Ж", "З", "И", "Й", "К", "Л", "М", "Н", "О", "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ", "Ъ", "Ы", "Ь", "Э", "Ю", "Я"}
local kabaneWindow = nil
hook.Add("PlayerButtonDown", "KabaneMenu", function (ply, button)
    if button == 10 and kabaneWindow == nil then
        if ply:IsSuperAdmin() then
            kabaneWindow = vgui.Create("DFrame")
            kabaneWindow:SetSize(ScrW()/1.5,ScrH()/1.5)
            kabaneWindow:Center()
            kabaneWindow:MakePopup()
            kabaneWindow:ShowCloseButton(false)
            kabaneWindow:SetTitle("")

            kabaneWindow.Paint = function(self,w,h)
                draw.RoundedBox( 8, 0, 0, w, h, Color( 80, 80, 80 ) )
            end

            function kabaneWindow:OnRemove()
                kabaneWindow = nil 
            end

            local alphPlys = {}
            local plysAll = player.GetAll()
            for i, value in ipairs(alphabet) do
                for p,chr in ipairs(player.GetAll()) do
                    if value == string.sub(chr:Name(), 1,2) then
                        table.insert(alphPlys, chr)  
                    end
                end
            end
            for i, value in ipairs(plysAll) do
                local val = 0
                for p,chr in ipairs(alphPlys) do
                    if chr == value then
                        val = 1
                    end
                end
                if val == 0 then
                    table.insert(alphPlys, value)
                end
            end 

            local buttonClose = kabaneWindow:Add("DButton")
            buttonClose:SetPos(kabaneWindow:GetWide()-buttonClose:GetWide(),buttonClose:GetY())
            buttonClose:SetText("Закрыть")
            buttonClose.DoClick = function()
                kabaneWindow:Remove()
            end

            local html = vgui.Create( "HTML", kabaneWindow )
            html:SetSize(kabaneWindow:GetWide()/3.3, kabaneWindow:GetTall()/2.4)
            html:SetPos(kabaneWindow:GetWide()/1.4,kabaneWindow:GetTall()/1.7)
            html:OpenURL( "https://sun9-71.userapi.com/impf/eHW-v3bQlQQyx6mdTueYkrQQXJjZF8ji2spuXA/AIS5ULP8ocQ.jpg?size=502x389&quality=96&sign=a8af24d30568c719ad09e8813f5407ac&type=album" )

            local plyNameText = kabaneWindow:Add("DTextEntry")
            plyNameText:SetSize(kabaneWindow:GetWide()/10,kabaneWindow:GetTall()/22)
            plyNameText:SetPos(kabaneWindow:GetX()-kabaneWindow:GetWide()/4.5,kabaneWindow:GetY()-kabaneWindow:GetTall()/6)
            plyNameText:SetValue("Имя игрока")

            local plyModelText = kabaneWindow:Add("DTextEntry")
            plyModelText:SetSize(plyNameText:GetSize())
            plyModelText:SetPos(plyNameText:GetWide()*1.5+plyNameText:GetX(),plyNameText:GetY())
            plyModelText:SetValue("Имя модели")

            local plyNameTwoText = kabaneWindow:Add("DTextEntry")
            plyNameTwoText:SetSize(plyNameText:GetSize())
            plyNameTwoText:SetPos(plyModelText:GetWide()*1.5+plyModelText:GetX(),plyModelText:GetY())
            plyNameTwoText:SetValue("Имя второго игрока")

            local DButtonModel = kabaneWindow:Add("DButton")
            DButtonModel:SetText("Изменить модель")
            DButtonModel:SetSize(plyNameText:GetSize())
            DButtonModel:SetPos(plyModelText:GetX(),plyModelText:GetTall()*1.5+plyModelText:GetY())
            DButtonModel.DoClick = function()
                net.Start("GetModelServerChange")
                net.WriteTable({plyNameText:GetValue(),plyModelText:GetValue(),plyNameTwoText:GetValue()})
                net.SendToServer()
            end

            local DButtonOneGluh = kabaneWindow:Add("DButton")
            DButtonOneGluh:SetText("Одна глухота")
            DButtonOneGluh:SetSize(plyNameText:GetSize())
            DButtonOneGluh:SetPos(plyModelText:GetX(),DButtonModel:GetTall()*1.5+DButtonModel:GetY())
            DButtonOneGluh.DoClick = function()
                net.Start("GetOneGluhServerChange")
                net.WriteTable({plyNameText:GetValue(),plyNameTwoText:GetValue()})
                net.SendToServer()
            end

            local DButtonGluh = kabaneWindow:Add("DButton")
            DButtonGluh:SetText("Полная глухота")
            DButtonGluh:SetSize(plyNameText:GetSize())
            DButtonGluh:SetPos(plyModelText:GetX(),DButtonOneGluh:GetTall()*1.5+DButtonOneGluh:GetY())
            DButtonGluh.DoClick = function()
                net.Start("GetGluhServerChange")
                net.WriteTable({plyNameText:GetValue()})
                net.SendToServer()
            end

            local plyYomuText = kabaneWindow:Add("DComboBox")
            plyYomuText:SetSize(kabaneWindow:GetWide()/10,kabaneWindow:GetTall()/22)
            plyYomuText:SetPos(DButtonGluh:GetX(),DButtonGluh:GetY()+DButtonGluh:GetTall()*4.0)
            plyYomuText:SetValue("Имя игрока")
            plyYomuText:AddChoice("","")
                for k,v in ipairs(alphPlys) do
                    plyYomuText:AddChoice(v:Nick(),v:Nick())
                end

            local htmlDolg = vgui.Create( "HTML", kabaneWindow )
            htmlDolg:SetSize(kabaneWindow:GetWide()/8, kabaneWindow:GetTall()/6)
            htmlDolg:SetPos(kabaneWindow:GetX()-kabaneWindow:GetWide()/4.5,plyYomuText:GetTall()*1.5 + plyYomuText:GetY())
            htmlDolg:OpenURL( "https://sun9-71.userapi.com/impg/80Q_CQsVSFAQemCCL9X3KYh7hUoybsQdEQWjSw/VxB2-ghzgkE.jpg?size=584x584&quality=95&sign=2f075eee135f4dd1876095204b43ad63&c_uniq_tag=Ze--CHjUq7J_t74CRNWB3QJY7D6D57TBa6tSWnKLncY&type=album" )
            
            local DButtonDolg = kabaneWindow:Add("DButton")
            DButtonDolg:SetText("Применить")
            DButtonDolg:SetSize(plyNameText:GetSize())
            DButtonDolg:SetPos(htmlDolg:GetX(),htmlDolg:GetTall()*1.5+htmlDolg:GetY())
            DButtonDolg.DoClick = function()
                net.Start("SamAbility")
                net.WriteTable({plyYomuText:GetOptionData(plyYomuText:GetSelectedID()),"dolg"})
                net.SendToServer()
            end

            local htmlYomu = vgui.Create( "HTML", kabaneWindow )
            htmlYomu:SetSize(kabaneWindow:GetWide()/8, kabaneWindow:GetTall()/6)
            htmlYomu:SetPos(htmlDolg:GetX()+htmlDolg:GetWide()*1.5,plyYomuText:GetTall()*1.5 + plyYomuText:GetY())
            htmlYomu:OpenURL( "https://en.kicdo.com/images/source/new_item/3142_Assassin_T3_YoumuusGhostblade.png" )
            
            local DButtonYomu = kabaneWindow:Add("DButton")
            DButtonYomu:SetText("Применить")
            DButtonYomu:SetSize(plyNameText:GetSize())
            DButtonYomu:SetPos(htmlYomu:GetX(),htmlYomu:GetTall()*1.5+htmlYomu:GetY())
            DButtonYomu.DoClick = function()
                net.Start("SamAbility")
                net.WriteTable({plyYomuText:GetOptionData(plyYomuText:GetSelectedID()),"yomu"})
                net.SendToServer()
            end

            local htmlSterak = vgui.Create( "HTML", kabaneWindow )
            htmlSterak:SetSize(kabaneWindow:GetWide()/8, kabaneWindow:GetTall()/6)
            htmlSterak:SetPos(htmlYomu:GetX()+htmlYomu:GetWide()*1.5,plyYomuText:GetTall()*1.5 + plyYomuText:GetY())
            htmlSterak:OpenURL( "https://yt3.googleusercontent.com/LNtcBBB3skJygZE6ngcWTk6D4sGtrpFiUk-KbW3R8d6tqDCj-9mQHUIIKYOrvgsH4Y6qpl36OUs=s900-c-k-c0x00ffffff-no-rj" )
            
            local DButtonSterak = kabaneWindow:Add("DButton")
            DButtonSterak:SetText("Применить")
            DButtonSterak:SetSize(plyNameText:GetSize())
            DButtonSterak:SetPos(htmlSterak:GetX(),htmlSterak:GetTall()*1.5+htmlSterak:GetY())
            DButtonSterak.DoClick = function()
                net.Start("SamAbility")
                net.WriteTable({plyYomuText:GetOptionData(plyYomuText:GetSelectedID()),"sterak"})
                net.SendToServer()
            end
        end
    end
end)

net.Receive("GetModelClientChange", function(len, ply)
    local tab = net.ReadTable()
    for i,v in ipairs(player.GetAll()) do
        if(v:Name()==tab[2]) then
            v:SetModel(tab[1])
        end
    end
end)