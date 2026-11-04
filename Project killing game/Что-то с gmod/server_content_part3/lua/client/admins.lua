local stamina = 200
local maxstamina = 200
local staminalenght = 10
local CanSee = false
local CanFly = false
local speedster = 0

RunConsoleCommand("mat_specular", "0")

net.Receive("TurnNamesOn2", function()
        local name = net.ReadString()
        if name == LocalPlayer():GetName() then
        CanSee = true
        end
    end)

net.Receive("TurnNamesOff2", function()
        local name = net.ReadString()
        if name == LocalPlayer():GetName() then
        CanSee = false
        end
    end)

net.Receive("TurnFlyOn2", function()
        local name = net.ReadString()
        if name == LocalPlayer():GetName() then
        CanFly = true
        end
    end)

net.Receive("TurnFlyOff2", function()
        local name = net.ReadString()
        if name == LocalPlayer():GetName() then
        CanFly = false
        end
    end)

hook.Add("HUDPaint", "Names", function()
        for k,v in pairs(player.GetAll()) do
            if v ~= LocalPlayer() then
                if (LocalPlayer():IsSuperAdmin() and volhackSupers == 0) or CanSee == true or LocalPlayer():GetUserGroup() == "spectator" or LocalPlayer():GetNWFloat("CanSeeEverybodyInRange") > LocalPlayer():GetPos():Distance(v:GetPos()) then
                    local pos = v:GetPos()
                    pos = pos:ToScreen()
                    draw.SimpleText(v:Name(), DermaDefault,pos.x,pos.y,color_white,TEXT_ALIGN_CENTER,TEXT_ALIGN_CENTER)
                end
            if LocalPlayer():GetNWString("CanSeeOnePerson") == v:Nick() then
                    local pos = v:GetPos()
                    pos = pos:ToScreen()
                    draw.SimpleText("Цель", DermaDefault,pos.x,pos.y,color_white,TEXT_ALIGN_CENTER,TEXT_ALIGN_CENTER)
                end
            end
        end
        if stamina < maxstamina then
        surface.SetDrawColor(Color(255,255,255,255))
            surface.SetMaterial(Material("sprites/ui/stamina/staminaborder"))
       -- surface.DrawTexturedRect(5,ScrH() - 27,(maxstamina)*2+10,22)
            surface.DrawTexturedRect(ScrW()-415,ScrH() - 27,(maxstamina)*2+10,22)
            surface.SetDrawColor(Color(255,255,255,255))
            surface.SetMaterial(Material("sprites/ui/stamina/stamina"))
        --surface.DrawTexturedRect(10,ScrH() - 22,stamina*2,12)
            surface.DrawTexturedRect(ScrW()-410+400-stamina*2,ScrH() - 22,stamina*2,12)
            
            end
            end)
       local RunSpeed = 250
hook.Add("Tick","AdminsTick",function()

        if LocalPlayer():IsValid() then
           stamina = LocalPlayer():GetNWFloat("PlayerStamina")

        if math.floor(stamina) == 0 then
            net.Start("StopRunDDF")
            net.WriteEntity(LocalPlayer())
            net.WriteFloat(RunSpeed)
            net.SendToServer()
            end
        if math.floor(stamina) == 10 then
            net.Start("StartRunDDF")
            net.WriteEntity(LocalPlayer())
            net.WriteFloat(RunSpeed)
            net.SendToServer()
            end

end
        end)

net.Receive("SetSpeed", function ()
    timer.Simple(0.1, function ()
    if(LocalPlayer():IsValid()) then
        local   PlayerName = LocalPlayer():Nick()
        if PlayerName == "Макото Наеги" or PlayerName == "Макото Наэги" then 
            RunSpeed = 190
            staminalenght = 10
        elseif (PlayerName == "Акане Овари" or PlayerName == "Аканэ Овари") then 
            RunSpeed = 215
            staminalenght = 7.5
        elseif (PlayerName == "Анджи Йонага" or PlayerName == "Анджи Ёнага") then 
            RunSpeed = 200
            staminalenght = 9
        elseif PlayerName == "Аой Асахина" then 
            RunSpeed = 215
            staminalenght = 6
        elseif PlayerName == "Чиаки Нанами" then 
            RunSpeed = 185
            staminalenght = 12
        elseif (PlayerName == "Селестия Люденбург" or PlayerName == "Селестия Люденбёрг" or PlayerName == "Селестия Люденберг") then 
            RunSpeed = 185
            staminalenght = 14
        elseif PlayerName == "Бьякуя Тогами" then 
            RunSpeed = 200
            staminalenght = 10
        elseif PlayerName == "Импостер" then 
            RunSpeed = 210
            staminalenght = 20
        elseif PlayerName == "Чихиро Фуджисаки" then 
            RunSpeed = 180
            staminalenght = 30
        elseif PlayerName == "Фуюхико Кузурю" then 
            RunSpeed = 195
            staminalenght = 15
        elseif PlayerName == "Гонта Гокухара" then 
            RunSpeed = 220
            staminalenght = 6
        elseif PlayerName == "Гандам Танака" then 
            RunSpeed = 200
            staminalenght = 10
        elseif (PlayerName == "Хаджиме Хината" or PlayerName == "Хадзиме Хината") then 
            RunSpeed = 200
            staminalenght = 10
        elseif (PlayerName == "Изуру Камакура") then 
            RunSpeed = 200
            staminalenght = 10
        elseif PlayerName == "Хифуми Ямада" then 
            RunSpeed = 180
            staminalenght = 35
        elseif PlayerName == "Химико Юмено" then 
            RunSpeed = 180
            staminalenght = 45
        elseif (PlayerName == "Хиёко Сайонджи" or PlayerName == "Хиёко Сайондзи")then 
            RunSpeed = 210
            staminalenght = 15
        elseif PlayerName == "Ибуки Миода" then 
            RunSpeed = 215
            staminalenght = 8
        elseif PlayerName == "Джунко Эношима" then 
            RunSpeed = 190
            staminalenght = 10
        elseif (PlayerName == "K1-B0" or PlayerName == "Киибо"or PlayerName == "Кибо") then 
            RunSpeed = 180
            staminalenght = 0.00001
        elseif (PlayerName == "Каедэ Акаматсу" or PlayerName == "Каэдэ Акаматсу") then 
            RunSpeed = 185
            staminalenght = 12
        elseif (PlayerName == "Кайто Момота" or PlayerName == "Каито Момота") then 
            RunSpeed = 205
            staminalenght = 14
        elseif (PlayerName == "Казуичи Сода" or PlayerName == "Казуити Сода") then 
            RunSpeed = 195
            staminalenght = 10
        elseif PlayerName == "Кируми Тоджо" then 
            RunSpeed = 210
            staminalenght = 7
        elseif (PlayerName == "Киётака Ишимару" or PlayerName == "Кийотака Ишимару") then 
            RunSpeed = 200
            staminalenght = 12
        elseif PlayerName == "Кокичи Ома" then 
            RunSpeed = 215
            staminalenght = 7
        elseif (PlayerName == "Корекиё Шингуджи" or PlayerName == "Корекиё Шингудзи" or PlayerName == "Корекие Шингуджи" or PlayerName == "Корекие Шингудзи") then 
            RunSpeed = 195
            staminalenght = 13
        elseif PlayerName == "Кёко Киригири" then 
            RunSpeed = 185
            staminalenght = 12
        elseif PlayerName == "Леон Кувата" then 
            RunSpeed = 210
            staminalenght = 8
        elseif (PlayerName == "Махиру Коидзуми" or PlayerName == "Махиру Коизуми") then 
            RunSpeed = 190
            staminalenght = 10
        elseif PlayerName == "Маки Харукава" then 
            RunSpeed = 215
            staminalenght = 6
        elseif (PlayerName == "Микан Тсумики" or PlayerName == "Микан Цумики") then 
            RunSpeed = 190
            staminalenght = 15
        elseif PlayerName == "Миу Ирума" then 
            RunSpeed = 180
            staminalenght = 8
        elseif PlayerName == "Мондо Овада" then 
            RunSpeed = 210
            staminalenght = 8
        elseif PlayerName == "Нагито Комаеда" or PlayerName == "Нагито Комаэда" then 
            RunSpeed = 180
            staminalenght = 30
        elseif PlayerName == "Некомару Нидай" then 
            RunSpeed = 215
            staminalenght = 7
        elseif PlayerName == "Пеко Пекояма" then 
            RunSpeed = 200
            staminalenght = 8.5
        elseif PlayerName == "Рантаро Амами" then 
            RunSpeed = 195
            staminalenght = 10
        elseif PlayerName == "Рёма Хоши" then 
            RunSpeed = 230
            staminalenght = 7
        elseif PlayerName == "Сакура Огами" then 
            RunSpeed = 210
            staminalenght = 7
        elseif (PlayerName == "Саяка Маизоно" or PlayerName == "Саяка Майзоно") then 
            RunSpeed = 205
            staminalenght = 12
        elseif (PlayerName == "Шуичи Саихара" or PlayerName == "Шуичи Сайхара") then 
            RunSpeed = 190
            staminalenght = 15
        elseif (PlayerName == "Сония Невермайнд" or PlayerName == "Соня Невермайнд" or PlayerName == "Сонья Невермайнд") then 
            RunSpeed = 185
            staminalenght = 9
        elseif PlayerName == "Тенко Чабашира" then 
            RunSpeed = 205
            staminalenght = 8
        elseif PlayerName == "Терутеру Ханамура" then 
            RunSpeed = 180
            staminalenght = 12
        elseif PlayerName == "Токо Фукава" then 
            RunSpeed = 190
            staminalenght = 14
        elseif (PlayerName == "Тсумуги Широгане" or PlayerName == "Цумуги Широгане" or PlayerName == "Тсумуги Широганэ" or PlayerName == "Цумуги Широганэ") then 
            RunSpeed = 190
            staminalenght = 10
        elseif (PlayerName == "Ясухиро Кагакурэ" or PlayerName == "Ясухиро Хагакурэ" or PlayerName == "Ясухиро Кагакуре" or PlayerName == "Ясухиро Хагакуре") then 
            RunSpeed = 195
            staminalenght = 10
        elseif PlayerName == "Комару Наэги" then 
        RunSpeed = 185
            staminalenght = 13
        elseif PlayerName == "Рёко Отонаши" then 
        RunSpeed = 190
            staminalenght = 10
        elseif PlayerName == "Рёта Митарай" then 
        RunSpeed = 185
            staminalenght = 18
        elseif PlayerName == "Юри Кагарин" then 
        RunSpeed = 220
            staminalenght = 12
        elseif PlayerName == "Хаджиме Макуноучи" then 
        RunSpeed = 220
            staminalenght = 6
        elseif PlayerName == "Кокоро Митсуме" then 
        RunSpeed = 170
            staminalenght = 16
        elseif PlayerName == "Эмма Магороби" then 
        RunSpeed = 185
            staminalenght = 12
        elseif PlayerName == "Сетсука Чибукуро" then 
        RunSpeed = 200
            staminalenght = 12
        elseif PlayerName == "Хибики Отонокоджи" then 
        RunSpeed = 175
            staminalenght = 12
        elseif PlayerName == "Канаде Отонокоджи" then 
        RunSpeed = 180
            staminalenght = 10
        elseif PlayerName == "Никей Йомиури" then 
        RunSpeed = 190
            staminalenght = 8
        elseif PlayerName == "Шинджи Касай" then 
        RunSpeed = 190
            staminalenght = 7
        elseif PlayerName == "Теруя Отори" then 
        RunSpeed = 190
            staminalenght = 8
        elseif PlayerName == "Ироха Ниджиуэ" then 
        RunSpeed = 175
            staminalenght = 20
        elseif PlayerName == "Сора" then 
        RunSpeed = 190
            staminalenght = 10
        elseif PlayerName == "Юки Маеда" then 
        RunSpeed = 215
            staminalenght = 5
        elseif PlayerName == "Микадо Санноджи" then 
        RunSpeed = 190
            staminalenght = 0.00000001
        elseif PlayerName == "Шобай Хашимото" then 
        RunSpeed = 200
            staminalenght = 6
        elseif PlayerName == "Йоруко Кабуя" then 
        RunSpeed = 180
            staminalenght = 8
        elseif PlayerName == "Сейко Кимуро" then 
        RunSpeed = 180
            staminalenght = 15
                        elseif PlayerName == "Аюму Фуджимори" then 
        RunSpeed = 180
            staminalenght = 30
        elseif PlayerName == "Акира Тсучия" then 
        RunSpeed = 175
            staminalenght = 14
        elseif PlayerName == "Арума Тодороки" then 
        RunSpeed = 200
            staminalenght = 7
        elseif PlayerName == "Касуми Изумо" then 
        RunSpeed = 180
            staminalenght = 14
        elseif PlayerName == "Казуоми Самеджима" then 
        RunSpeed = 220
            staminalenght = 7
        elseif PlayerName == "Кёго Сакума" then 
        RunSpeed = 230
            staminalenght = 7
        elseif PlayerName == "Майко Кагура" then 
        RunSpeed = 210
            staminalenght = 7
        elseif PlayerName == "Марин Мизута" then 
        RunSpeed = 185
            staminalenght = 16
        elseif PlayerName == "Микото Итсуки" then 
        RunSpeed = 210
            staminalenght = 7
        elseif PlayerName == "Мисузу Аисака" then 
        RunSpeed = 185
            staminalenght = 12
        elseif PlayerName == "Митсунари Кога" then 
        RunSpeed = 190
            staminalenght = 9.5
        elseif PlayerName == "Наруми Осоне" then 
        RunSpeed = 200
            staminalenght = 10
        elseif PlayerName == "Нико Химуро" then 
        RunSpeed = 195
            staminalenght = 12
        elseif PlayerName == "Cайджи Рокудо" then 
        RunSpeed = 180
            staminalenght = 12
        elseif PlayerName == "Сейши Йодогава" then 
        RunSpeed = 215
            staminalenght = 5
        elseif PlayerName == "Мисаки Хомма" then 
        RunSpeed = 185
            staminalenght = 10
        elseif PlayerName == "Йоши Симудзу" then 
        RunSpeed = 205
            staminalenght = 8.5
        elseif PlayerName == "Нана Игараси" then 
        RunSpeed = 190
            staminalenght = 15
        elseif PlayerName == "Шу Ямамото" then 
        RunSpeed = 195
            staminalenght = 8.2
        elseif PlayerName == "Рюдзи Гото" then 
        RunSpeed = 215
            staminalenght = 7
        elseif PlayerName == "Кохару Китамура" then 
        RunSpeed = 180
            staminalenght = 11
        elseif PlayerName == "Йоширо Тогучи" then 
        RunSpeed = 190
            staminalenght = 12
        elseif PlayerName == "Аюми Хирано" then 
        RunSpeed = 200
            staminalenght = 9
        elseif PlayerName == "Хидеки Такада" then 
        RunSpeed = 205
            staminalenght = 8.5
        elseif PlayerName == "Кермит Невилл" then 
        RunSpeed = 205
            staminalenght = 8
        elseif PlayerName == "Хидеёси Сигуяма" then 
        RunSpeed = 185
            staminalenght = 12
        elseif PlayerName == "Мари Цудзи" then 
        RunSpeed = 200
            staminalenght = 9
        elseif PlayerName == "Торо Хаттори" then 
        RunSpeed = 190
            staminalenght = 10.5
        elseif PlayerName == "Сецуко Хиросэ" then 
        RunSpeed = 220
            staminalenght = 0.00000001
        elseif PlayerName == "Йоко Нагата" then 
        RunSpeed = 190
            staminalenght = 12
        elseif PlayerName == "Рикуто Минами" then 
        RunSpeed = 185
            staminalenght = 13
                    elseif PlayerName == "Энигма" then 
        RunSpeed = 195
            staminalenght = 9
                    elseif PlayerName == "Мораитеру" then 
        RunSpeed = 180
            staminalenght = 12
                    elseif PlayerName == "Канцел" then 
        RunSpeed = 180
            staminalenght = 13
                    elseif PlayerName == "Кросс" then 
        RunSpeed = 190
            staminalenght = 10
                    elseif PlayerName == "Рокс" then 
        RunSpeed = 195
            staminalenght = 9
                    elseif PlayerName == "Рок" then 
        RunSpeed = 190
            staminalenght = 7
                    elseif PlayerName == "Анон" then 
        RunSpeed = 180
            staminalenght = 13
                    elseif PlayerName == "Скарлет" then 
        RunSpeed = 180
            staminalenght = 12
                    elseif PlayerName == "Покет" then 
        RunSpeed = 210
            staminalenght = 6
                    elseif PlayerName == "Корза" then 
        RunSpeed = 190
            staminalenght = 10
                    elseif PlayerName == "Рисси" then 
        RunSpeed = 175
            staminalenght = 15
                    elseif PlayerName == "Твин" then 
        RunSpeed = 195
            staminalenght = 9
                    elseif PlayerName == "Якси" then 
        RunSpeed = 195
            staminalenght = 4
                    elseif PlayerName == "Грисп" then 
        RunSpeed = 190
            staminalenght = 4


        elseif PlayerName == "Хесед" then 
        RunSpeed = 195
        staminalenght = 4
        elseif PlayerName == "Хару Такиби" then 
        RunSpeed = 190
            staminalenght = 10
        elseif PlayerName == "Хано Хананокизу" then 
        RunSpeed = 190
            staminalenght = 10
        elseif PlayerName == "Мишель Кайзер" then 
        RunSpeed = 190
            staminalenght = 10
        elseif PlayerName == "Ари" or PlayerName == "Аризу Канэко" then 
        RunSpeed = 200
            staminalenght = 8
        elseif PlayerName == "Кэрон Шиока" then 
        RunSpeed = 195
            staminalenght = 9
        elseif PlayerName == "Ки Дон Сон" then 
        RunSpeed = 180
            staminalenght = 12
        elseif PlayerName == "Рамбл Тауэ" then 
        RunSpeed = 190
            staminalenght = 10
        elseif PlayerName == "Юкио Такэда" then 
        RunSpeed = 185
            staminalenght = 10
        elseif PlayerName == "Леонье Солгейм" then 
        RunSpeed = 190
            staminalenght = 10
        elseif PlayerName == "Реджинальд Блэкмен" then 
        RunSpeed = 205
            staminalenght = 14
        elseif PlayerName == "Сан Хо Сон" then 
        RunSpeed = 200
            staminalenght = 6
        elseif PlayerName == "Теруми Тодо" then 
        RunSpeed = 195
            staminalenght = 8
        elseif PlayerName == "Дори Мори" then 
        RunSpeed = 180
            staminalenght = 10


                else
            RunSpeed = 190
            staminalenght = 10
        end
        end
                    net.Start("StartRunDDF")
            net.WriteEntity(LocalPlayer())
            net.WriteFloat(RunSpeed)
            net.SendToServer()
            net.Start("SetPlayerMaxStamina")
            net.WriteEntity(LocalPlayer())
            net.WriteFloat(staminalenght)
            net.SendToServer()
end)
          end)

print("Speed saved")